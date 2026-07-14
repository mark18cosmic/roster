import { Socket } from "node:net";
import {
  ZK,
  createTcpPacket,
  parseAttendanceRecords,
  parseTcpResponse,
  type ZkAttendanceRecord,
  type ZkResponse,
} from "@roster/shared";

/**
 * Minimal ZK TCP client: connect, pull attendance logs, disconnect.
 * Enough of the pyzk flow to drive poll mode and the mock ZK server; the same
 * framing would talk to a real MB20-VL.
 */
export class ZkClient {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private sessionId = 0;
  private replyId = 0;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 5000,
  ) {}

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const s = new Socket();
      s.setTimeout(this.timeoutMs);
      s.once("error", reject);
      s.once("timeout", () => reject(new Error("ZK connect timeout")));
      s.connect(this.port, this.host, () => {
        s.removeListener("error", reject);
        this.socket = s;
        s.on("data", (chunk) => {
          this.buffer = Buffer.concat([this.buffer, chunk]);
        });
        resolve();
      });
    });

    const res = await this.command(ZK.CMD_CONNECT);
    if (res.command !== ZK.CMD_ACK_OK) throw new Error(`ZK connect refused (cmd ${res.command})`);
    this.sessionId = res.sessionId;
  }

  async getAttendance(): Promise<ZkAttendanceRecord[]> {
    // Disable the device while reading (pyzk does this to get a stable snapshot).
    await this.command(ZK.CMD_DISABLEDEVICE);

    const frames = await this.commandCollect(ZK.CMD_ATTLOG_RRQ);
    const dataChunks = frames.filter((f) => f.command === ZK.CMD_DATA).map((f) => f.data);
    const all = Buffer.concat(dataChunks);

    await this.command(ZK.CMD_ENABLEDEVICE);
    return parseAttendanceRecords(all);
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return;
    try {
      await this.command(ZK.CMD_EXIT);
    } catch {
      /* best effort */
    }
    this.socket.destroy();
    this.socket = null;
  }

  /** Send a command and await exactly one response frame. */
  private async command(command: number, data?: Buffer): Promise<ZkResponse> {
    const frames = await this.send(command, data, false);
    if (frames.length === 0) throw new Error(`No response to ZK command ${command}`);
    return frames[0]!;
  }

  /** Send a command and collect all frames until an ACK terminates the stream. */
  private async commandCollect(command: number, data?: Buffer): Promise<ZkResponse[]> {
    return this.send(command, data, true);
  }

  private send(command: number, data: Buffer | undefined, collect: boolean): Promise<ZkResponse[]> {
    const socket = this.socket;
    if (!socket) throw new Error("ZK socket not connected");

    this.replyId = (this.replyId + 1) & 0xffff;
    const packet = createTcpPacket(command, this.sessionId, this.replyId, data);

    return new Promise<ZkResponse[]>((resolve, reject) => {
      const frames: ZkResponse[] = [];
      const timer = setTimeout(() => {
        cleanup();
        // For a collect read, timing out just means "no more frames".
        collect ? resolve(frames) : reject(new Error(`ZK command ${command} timed out`));
      }, this.timeoutMs);

      const onData = () => {
        let parsed = parseTcpResponse(this.buffer);
        while (parsed) {
          this.buffer = this.buffer.subarray(parsed.consumed);
          frames.push(parsed.response);
          const cmd = parsed.response.command;
          if (!collect) {
            cleanup();
            return resolve(frames);
          }
          // In collect mode, an ACK_OK after data frames ends the stream.
          if (cmd === ZK.CMD_ACK_OK && frames.some((f) => f.command === ZK.CMD_DATA)) {
            cleanup();
            return resolve(frames);
          }
          parsed = parseTcpResponse(this.buffer);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeListener("data", onData);
      };

      socket.on("data", onData);
      socket.write(packet, (err) => {
        if (err) {
          cleanup();
          reject(err);
        } else {
          // Data may already be buffered from a previous frame.
          onData();
        }
      });
    });
  }
}
