import { createServer, type Server, type Socket } from "node:net";
import {
  ZK,
  createTcpPacket,
  encodeAttendanceRecord,
  parseTcpResponse,
  type ZkAttendanceRecord,
} from "@roster/shared";

/**
 * Mock ZK TCP server (port 4370) so the poll path is testable without hardware.
 * Speaks the same framing as the real device / our ZkClient:
 *   CMD_CONNECT      -> CMD_ACK_OK (assigns a session id)
 *   CMD_DISABLEDEVICE-> CMD_ACK_OK
 *   CMD_ATTLOG_RRQ   -> CMD_DATA (all records) then CMD_ACK_OK
 *   CMD_ENABLEDEVICE -> CMD_ACK_OK
 *   CMD_EXIT         -> CMD_ACK_OK
 */
export class MockZkServer {
  private server: Server | null = null;
  private sessionSeq = 1;

  constructor(private readonly records: ZkAttendanceRecord[]) {}

  listen(port: number, host = "0.0.0.0"): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((sock) => this.onConnection(sock));
      this.server.listen(port, host, () => {
        console.log(`[zk-server] listening on ${host}:${port} (${this.records.length} records)`);
        resolve();
      });
    });
  }

  close(): void {
    this.server?.close();
  }

  private onConnection(sock: Socket): void {
    let buffer = Buffer.alloc(0);
    let sessionId = 0;

    sock.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let parsed = parseTcpResponse(buffer);
      while (parsed) {
        buffer = buffer.subarray(parsed.consumed);
        const { command, replyId } = parsed.response;

        switch (command) {
          case ZK.CMD_CONNECT: {
            sessionId = this.sessionSeq++;
            sock.write(createTcpPacket(ZK.CMD_ACK_OK, sessionId, replyId));
            break;
          }
          case ZK.CMD_ATTLOG_RRQ: {
            const data = Buffer.concat(this.records.map(encodeAttendanceRecord));
            sock.write(createTcpPacket(ZK.CMD_DATA, sessionId, replyId, data));
            sock.write(createTcpPacket(ZK.CMD_ACK_OK, sessionId, replyId));
            break;
          }
          case ZK.CMD_EXIT: {
            sock.write(createTcpPacket(ZK.CMD_ACK_OK, sessionId, replyId));
            sock.end();
            break;
          }
          default: {
            // ENABLE/DISABLE/etc — just acknowledge.
            sock.write(createTcpPacket(ZK.CMD_ACK_OK, sessionId, replyId));
          }
        }
        parsed = parseTcpResponse(buffer);
      }
    });

    sock.on("error", () => sock.destroy());
  }
}
