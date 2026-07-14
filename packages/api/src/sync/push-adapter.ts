import type { PunchSink, SyncAdapter } from "@roster/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { DB } from "../db/client.js";
import { devices } from "../db/schema.js";
import { handshakeConfig, parseAttlog } from "./adms.js";

/**
 * Push mode: the device drives us. This adapter owns the ADMS `/iclock/*`
 * routes; the HTTP server lifecycle is what actually starts/stops it, so
 * start()/stop() just flip an active flag. Data flows device -> routes ->
 * shared PunchSink, exactly as poll mode does.
 */
export class PushAdapter implements SyncAdapter {
  readonly mode = "push" as const;
  private active = false;

  constructor(
    private readonly db: DB,
    private readonly sink: PunchSink,
    private readonly opts: { sharedKey: string },
  ) {}

  async start(): Promise<void> {
    this.active = true;
  }
  async stop(): Promise<void> {
    this.active = false;
  }

  /** Mountable Hono app implementing the ADMS endpoints. */
  routes(): Hono<{ Variables: { deviceSerial: string } }> {
    const app = new Hono<{ Variables: { deviceSerial: string } }>();

    // Auth: valid serial (registered device) + optional shared key.
    app.use("/*", async (c, next) => {
      const serial = c.req.query("SN");
      if (!serial) return c.text("SN required", 400);

      if (this.opts.sharedKey) {
        const key = c.req.query("key") ?? c.req.header("x-adms-key");
        if (key !== this.opts.sharedKey) return c.text("unauthorized", 401);
      }

      const device = (
        await this.db.select().from(devices).where(eq(devices.serial, serial)).limit(1)
      )[0];
      if (!device) return c.text("unknown device", 401);

      c.set("deviceSerial", serial);
      await next();
    });

    // Handshake / options fetch. Also record contact as a heartbeat.
    app.get("/cdata", async (c) => {
      const serial = c.get("deviceSerial");
      await this.touch(serial);
      return c.text(handshakeConfig(serial));
    });

    // Attendance records upload. Must reply with literal "OK".
    app.post("/cdata", async (c) => {
      const serial = c.get("deviceSerial");
      const table = c.req.query("table");
      const body = await c.req.text();

      if (table && table !== "ATTLOG") {
        // OPERLOG / other tables: acknowledge but ignore for v1.
        await this.touch(serial);
        return c.text("OK");
      }

      try {
        const punches = parseAttlog(serial, body);
        if (punches.length > 0) await this.sink.ingest(punches);
      } catch (err) {
        console.error("[push] ATTLOG parse error:", err);
        // Still ACK so the device doesn't wedge retrying a bad batch forever.
      }
      return c.text("OK");
    });

    // Device polls for server commands; we issue none.
    app.get("/getrequest", async (c) => {
      const serial = c.get("deviceSerial");
      await this.touch(serial);
      return c.text("OK");
    });

    // Device posts command results.
    app.post("/devicecmd", (c) => c.text("OK"));

    return app;
  }

  private async touch(serial: string): Promise<void> {
    await this.db
      .update(devices)
      .set({ lastHeartbeat: new Date() })
      .where(eq(devices.serial, serial));
  }
}
