import type { NormalizedPunch, PunchType, VerifyMode } from "@roster/shared";

/**
 * ZKTeco ADMS (push protocol) helpers for the MB20-VL.
 *
 * In push mode the terminal makes plain HTTP requests to the server:
 *   GET  /iclock/cdata?SN=<serial>&options=all&...   -> handshake, expects a
 *        plaintext config block.
 *   POST /iclock/cdata?SN=<serial>&table=ATTLOG      -> attendance records, one
 *        per line, tab-separated. Server must reply with the literal "OK".
 *   GET  /iclock/getrequest?SN=<serial>              -> polls for server->device
 *        commands; we have none, so reply "OK".
 *
 * ATTLOG line layout (fields after the first two are device-dependent):
 *   PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode \t ...
 */

// status (punch state) -> our punch direction
function mapPunchType(status: string | undefined): PunchType {
  switch (status) {
    case "0":
      return "in"; // check-in
    case "1":
      return "out"; // check-out
    case "2": // break-out
    case "5": // ot-out
      return "out";
    case "3": // break-in
    case "4": // ot-in
      return "in";
    default:
      return "unknown";
  }
}

// verify method -> our verify mode
function mapVerifyMode(verify: string | undefined): VerifyMode {
  switch (verify) {
    case "0":
      return "password";
    case "1":
      return "fingerprint";
    case "2":
      return "card";
    case "15":
      return "face";
    default:
      return "other";
  }
}

/** Device local time "YYYY-MM-DD HH:MM:SS" -> ISO string. */
function deviceTimeToIso(dt: string): string {
  // Treat as an absolute instant; the device clock is the source of truth.
  const iso = dt.trim().replace(" ", "T");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable device time: "${dt}"`);
  return d.toISOString();
}

/**
 * Parse an ATTLOG request body into normalized punches.
 * Skips blank lines; throws on a malformed non-blank line so the caller can
 * decide whether to reject the batch.
 */
export function parseAttlog(serial: string, body: string): NormalizedPunch[] {
  const punches: NormalizedPunch[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const fields = line.split("\t");
    const [pin, dateTime, status, verify] = fields;
    if (!pin || !dateTime) throw new Error(`Malformed ATTLOG line: "${line}"`);
    punches.push({
      deviceSerial: serial,
      deviceUserId: pin.trim(),
      timestamp: deviceTimeToIso(dateTime),
      verifyMode: mapVerifyMode(verify),
      punchType: mapPunchType(status),
      raw: line,
    });
  }
  return punches;
}

/**
 * Build one ATTLOG line the way an MB20-VL would, for the simulator.
 */
export function buildAttlogLine(opts: {
  pin: string;
  timestamp: Date;
  status: number;
  verify: number;
  workcode?: number;
}): string {
  const dt = formatDeviceTime(opts.timestamp);
  return [opts.pin, dt, String(opts.status), String(opts.verify), String(opts.workcode ?? 0)].join(
    "\t",
  );
}

export function formatDeviceTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/**
 * The handshake config block a device expects from the initial cdata GET.
 * Values tell the device how/when to push; conservative defaults are fine.
 */
export function handshakeConfig(serial: string): string {
  return [
    `GET OPTION FROM: ${serial}`,
    "ATTLOGStamp=None",
    "OPERLOGStamp=None",
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    "Delay=30",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "TimeZone=0",
    "Realtime=1",
    "Encrypt=0",
  ].join("\n");
}
