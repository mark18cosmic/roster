/**
 * Mock MB20-VL acting as an ADMS push client.
 *
 * Reproduces the real terminal's push flow against our api:
 *   1. GET  /iclock/cdata?SN=..&options=all   (handshake; expects config text)
 *   2. POST /iclock/cdata?SN=..&table=ATTLOG   (punch records; expects "OK")
 *   3. GET  /iclock/getrequest?SN=..           (command poll; expects "OK")
 *
 * Records are tab-separated: PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode
 */

export interface SimPunch {
  pin: string;
  at: Date;
  status: number; // 0 in, 1 out
  verify: number; // 1 fingerprint, 2 card, 15 face
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

function buildAttlog(punches: SimPunch[]): string {
  return punches
    .map((p) => [p.pin, fmt(p.at), String(p.status), String(p.verify), "0"].join("\t"))
    .join("\n");
}

export interface AdmsDeviceOptions {
  targetUrl: string;
  serial: string;
  sharedKey?: string;
}

export class AdmsDevice {
  constructor(private readonly opts: AdmsDeviceOptions) {}

  private url(path: string, params: Record<string, string> = {}): string {
    const u = new URL(path, this.opts.targetUrl);
    u.searchParams.set("SN", this.opts.serial);
    if (this.opts.sharedKey) u.searchParams.set("key", this.opts.sharedKey);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  /** Perform the initial options handshake. Returns the server config text. */
  async handshake(): Promise<string> {
    const res = await fetch(this.url("/iclock/cdata", { options: "all", pushver: "2.4.1" }));
    if (!res.ok) throw new Error(`handshake failed: ${res.status} ${await res.text()}`);
    return res.text();
  }

  /** Upload a batch of punches. Server must answer "OK". */
  async pushPunches(punches: SimPunch[]): Promise<void> {
    const res = await fetch(this.url("/iclock/cdata", { table: "ATTLOG", Stamp: "0" }), {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: buildAttlog(punches),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`push failed: ${res.status} ${text}`);
    if (text.trim() !== "OK") throw new Error(`unexpected push reply: "${text}"`);
  }

  /** Poll for commands (we expect none). */
  async getRequest(): Promise<string> {
    const res = await fetch(this.url("/iclock/getrequest"));
    return res.text();
  }
}
