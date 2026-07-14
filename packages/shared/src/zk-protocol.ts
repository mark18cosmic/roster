/**
 * ZKTeco binary protocol (TCP 4370) framing — a focused TypeScript
 * reimplementation of the parts of `pyzk` needed to pull attendance logs.
 *
 * Kept in @roster/shared so the poll client (api) and the mock ZK server
 * (simulator) produce byte-identical frames, and so the same code path is what
 * would talk to real hardware.
 *
 * Frame layout (TCP):
 *   [4B tcp magic][4B payload length LE] then the payload:
 *   [2B command LE][2B checksum LE][2B session LE][2B reply LE][data...]
 */

const USHRT_MAX = 0xffff;

export const ZK = {
  CMD_CONNECT: 1000,
  CMD_EXIT: 1001,
  CMD_ENABLEDEVICE: 1002,
  CMD_DISABLEDEVICE: 1003,
  CMD_ACK_OK: 2000,
  CMD_ACK_ERROR: 2001,
  CMD_ACK_UNAUTH: 2005,
  CMD_PREPARE_DATA: 1500,
  CMD_DATA: 1501,
  CMD_FREE_DATA: 1502,
  CMD_DATA_WRRQ: 1503,
  CMD_ATTLOG_RRQ: 13,
} as const;

const TCP_MAGIC_1 = 0x5050;
const TCP_MAGIC_2 = 0x7d82;

/** pyzk create_checksum, over a payload lacking its checksum field. */
export function createChecksum(buf: Buffer): number {
  let checksum = 0;
  let i = 0;
  let l = buf.length;
  while (l > 1) {
    checksum += buf.readUInt16LE(i);
    i += 2;
    if (checksum > USHRT_MAX) checksum -= USHRT_MAX;
    l -= 2;
  }
  if (l) checksum += buf[i]!;
  while (checksum > USHRT_MAX) checksum -= USHRT_MAX;
  checksum = ~checksum;
  while (checksum < 0) checksum += USHRT_MAX;
  return checksum & 0xffff;
}

/** Build a full TCP frame for a command. */
export function createTcpPacket(
  command: number,
  sessionId: number,
  replyId: number,
  data: Buffer = Buffer.alloc(0),
): Buffer {
  // payload with checksum zeroed, to compute checksum
  const head = Buffer.alloc(8);
  head.writeUInt16LE(command, 0);
  head.writeUInt16LE(0, 2);
  head.writeUInt16LE(sessionId, 4);
  head.writeUInt16LE(replyId, 6);
  const withoutChecksum = Buffer.concat([head, data]);
  const checksum = createChecksum(withoutChecksum);

  const payload = Buffer.concat([head, data]);
  payload.writeUInt16LE(checksum, 2);

  const top = Buffer.alloc(8);
  top.writeUInt16LE(TCP_MAGIC_1, 0);
  top.writeUInt16LE(TCP_MAGIC_2, 2);
  top.writeUInt32LE(payload.length, 4);
  return Buffer.concat([top, payload]);
}

export interface ZkResponse {
  command: number;
  checksum: number;
  sessionId: number;
  replyId: number;
  data: Buffer;
}

/**
 * Parse one TCP frame from the front of `buf`. Returns the response plus the
 * total bytes consumed, or null if `buf` doesn't yet hold a complete frame.
 */
export function parseTcpResponse(buf: Buffer): { response: ZkResponse; consumed: number } | null {
  if (buf.length < 8) return null;
  if (buf.readUInt16LE(0) !== TCP_MAGIC_1 || buf.readUInt16LE(2) !== TCP_MAGIC_2) {
    throw new Error("Bad ZK TCP magic");
  }
  const payloadLen = buf.readUInt32LE(4);
  if (buf.length < 8 + payloadLen) return null;
  const payload = buf.subarray(8, 8 + payloadLen);
  return {
    consumed: 8 + payloadLen,
    response: {
      command: payload.readUInt16LE(0),
      checksum: payload.readUInt16LE(2),
      sessionId: payload.readUInt16LE(4),
      replyId: payload.readUInt16LE(6),
      data: Buffer.from(payload.subarray(8)),
    },
  };
}

/** pyzk time encoding: a single packed integer. */
export function encodeZkTime(d: Date): number {
  return (
    ((d.getFullYear() - 2000) * 12 * 31 + d.getMonth() * 31 + (d.getDate() - 1)) * (24 * 60 * 60) +
    (d.getHours() * 60 + d.getMinutes()) * 60 +
    d.getSeconds()
  );
}

export function decodeZkTime(t: number): Date {
  const second = t % 60;
  t = Math.floor(t / 60);
  const minute = t % 60;
  t = Math.floor(t / 60);
  const hour = t % 24;
  t = Math.floor(t / 24);
  const day = (t % 31) + 1;
  t = Math.floor(t / 31);
  const month = t % 12;
  t = Math.floor(t / 12);
  const year = t + 2000;
  return new Date(year, month, day, hour, minute, second);
}

export interface ZkAttendanceRecord {
  uid: number;
  userId: string;
  status: number; // verify method
  punch: number; // punch state (in/out)
  timestamp: Date;
}

const RECORD_SIZE = 40;

/** Encode one attendance record (40-byte layout: <H24sB4sB8x). */
export function encodeAttendanceRecord(r: ZkAttendanceRecord): Buffer {
  const buf = Buffer.alloc(RECORD_SIZE);
  buf.writeUInt16LE(r.uid & 0xffff, 0);
  buf.write(r.userId, 2, 24, "ascii");
  buf.writeUInt8(r.status & 0xff, 26);
  buf.writeUInt32LE(encodeZkTime(r.timestamp) >>> 0, 27);
  buf.writeUInt8(r.punch & 0xff, 31);
  // bytes 32..39 reserved
  return buf;
}

/** Parse a concatenated attendance buffer into records (40 bytes each). */
export function parseAttendanceRecords(data: Buffer): ZkAttendanceRecord[] {
  const out: ZkAttendanceRecord[] = [];
  for (let i = 0; i + RECORD_SIZE <= data.length; i += RECORD_SIZE) {
    const rec = data.subarray(i, i + RECORD_SIZE);
    const uid = rec.readUInt16LE(0);
    const userId = rec.toString("ascii", 2, 26).replace(/\0+$/, "").trim();
    if (userId === "") continue;
    const status = rec.readUInt8(26);
    const timestamp = decodeZkTime(rec.readUInt32LE(27));
    const punch = rec.readUInt8(31);
    out.push({ uid, userId, status, punch, timestamp });
  }
  return out;
}
