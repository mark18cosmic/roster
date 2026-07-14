import type { ZkAttendanceRecord } from "@roster/shared";
import { AdmsDevice, type SimPunch } from "./adms-device.js";
import { MockZkServer } from "./zk-server.js";

/**
 * Mock MB20-VL simulator — a long-lived integration test tool.
 *
 *   npm run simulator                 # push a day of punches via ADMS (default)
 *   npm run simulator -- push         # same, explicit
 *   npm run simulator -- zk-server    # run a mock ZK device for poll mode
 *
 * Env: SIM_TARGET_URL, SIM_DEVICE_SERIAL, SIM_SHARED_KEY, ZK_DEVICE_PORT
 */

const TARGET_URL = process.env.SIM_TARGET_URL ?? "http://localhost:8080";
const SERIAL = process.env.SIM_DEVICE_SERIAL ?? "MB20VL-SIM-0001";
const SHARED_KEY = process.env.SIM_SHARED_KEY ?? process.env.ADMS_SHARED_KEY ?? "";
const ZK_PORT = Number.parseInt(process.env.ZK_DEVICE_PORT ?? "4370", 10);

/** A realistic-ish day: three staff (device ids 1..3) each with an in and out punch. */
function sampleDay(base = new Date()): SimPunch[] {
  const day = new Date(base);
  const at = (uid: number, h: number, m: number) => {
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
  };
  return [
    { pin: "1", at: at(1, 8, 58), status: 0, verify: 1 }, // Alice in (on time)
    { pin: "1", at: at(1, 17, 32), status: 1, verify: 1 }, // Alice out
    { pin: "2", at: at(2, 9, 14), status: 0, verify: 2 }, // Bob in (late)
    { pin: "2", at: at(2, 18, 3), status: 1, verify: 2 }, // Bob out
    { pin: "3", at: at(3, 8, 45), status: 0, verify: 15 }, // Carol in
    { pin: "3", at: at(3, 16, 50), status: 1, verify: 15 }, // Carol out
  ];
}

function sampleRecords(base = new Date()): ZkAttendanceRecord[] {
  return sampleDay(base).map((p, i) => ({
    uid: i + 1,
    userId: p.pin,
    status: p.verify,
    punch: p.status,
    timestamp: p.at,
  }));
}

async function runPush() {
  const device = new AdmsDevice({ targetUrl: TARGET_URL, serial: SERIAL, sharedKey: SHARED_KEY });
  console.log(`[sim] push -> ${TARGET_URL} as SN=${SERIAL}`);
  const config = await device.handshake();
  console.log(`[sim] handshake OK (${config.split("\n").length} config lines)`);

  const punches = sampleDay();
  await device.pushPunches(punches);
  console.log(`[sim] pushed ${punches.length} punches, all acknowledged "OK"`);
  await device.getRequest();
  console.log("[sim] command poll OK — done.");
}

async function runZkServer() {
  const server = new MockZkServer(sampleRecords());
  await server.listen(ZK_PORT);
  console.log("[sim] mock ZK device running. Ctrl-C to stop.");
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      server.close();
      process.exit(0);
    });
  }
}

const mode = process.argv[2] ?? "push";
const run = mode === "zk-server" ? runZkServer : runPush;
run().catch((err) => {
  console.error("[sim] failed:", err);
  process.exit(1);
});
