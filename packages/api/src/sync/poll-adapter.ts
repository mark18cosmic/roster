import type { NormalizedPunch, PunchSink, SyncAdapter, VerifyMode } from "@roster/shared";
import type { ZkAttendanceRecord } from "@roster/shared";
import { eq } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { devices } from "../db/schema.js";
import { ZkClient } from "./zk-client.js";

function mapVerify(status: number): VerifyMode {
  switch (status) {
    case 0:
      return "password";
    case 1:
      return "fingerprint";
    case 2:
      return "card";
    case 15:
      return "face";
    default:
      return "other";
  }
}

function mapPunch(punch: number): "in" | "out" | "unknown" {
  switch (punch) {
    case 0:
    case 3:
    case 4:
      return "in";
    case 1:
    case 2:
    case 5:
      return "out";
    default:
      return "unknown";
  }
}

/**
 * Poll mode: we drive the device. A timer loop connects to each poll-mode
 * device over TCP 4370, pulls attendance, normalizes into the SAME
 * NormalizedPunch shape push mode uses, and writes through the SAME sink.
 */
export class PollAdapter implements SyncAdapter {
  readonly mode = "poll" as const;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DB,
    private readonly sink: PunchSink,
    private readonly opts: { intervalSeconds: number; defaultPort: number },
  ) {}

  async start(): Promise<void> {
    if (this.timer) return;
    // Kick once immediately, then on an interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalSeconds * 1000);
    console.log(`[poll] worker started (every ${this.opts.intervalSeconds}s)`);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One sweep across all poll-mode devices. Public so it can be triggered/tested. */
  async tick(): Promise<void> {
    if (this.running) return; // avoid overlapping sweeps
    this.running = true;
    try {
      const pollDevices = await this.db
        .select()
        .from(devices)
        .where(eq(devices.syncMode, "poll"));

      for (const device of pollDevices) {
        if (!device.ipAddress) continue;
        try {
          await this.pollDevice(device.serial, device.ipAddress, device.port ?? this.opts.defaultPort);
          await this.db
            .update(devices)
            .set({ lastHeartbeat: new Date() })
            .where(eq(devices.id, device.id));
        } catch (err) {
          console.error(`[poll] device ${device.serial} failed:`, (err as Error).message);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async pollDevice(serial: string, host: string, port: number): Promise<void> {
    const client = new ZkClient(host, port);
    await client.connect();
    try {
      const records = await client.getAttendance();
      const punches: NormalizedPunch[] = records.map((r: ZkAttendanceRecord) => ({
        deviceSerial: serial,
        deviceUserId: r.userId,
        timestamp: r.timestamp.toISOString(),
        verifyMode: mapVerify(r.status),
        punchType: mapPunch(r.punch),
        raw: `zk uid=${r.uid} status=${r.status} punch=${r.punch}`,
      }));
      if (punches.length > 0) {
        const result = await this.sink.ingest(punches);
        console.log(
          `[poll] ${serial}: ${punches.length} records (accepted ${result.accepted}, skipped ${result.skipped})`,
        );
      }
    } finally {
      await client.disconnect();
    }
  }
}
