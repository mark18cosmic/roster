/**
 * Shared sync abstraction.
 *
 * Both sync modes — `push` (device calls our ADMS endpoints) and `poll`
 * (we connect to the device over TCP 4370) — normalize device data into the
 * same {@link NormalizedPunch} shape and hand it to the same sink, so the rest
 * of the system never needs to know which mode produced an event.
 *
 * Milestone 4 implements PushAdapter; milestone 5 implements PollAdapter.
 * Keeping the contract here (not inside api) means the simulator and any
 * future tooling can depend on the same types without importing the server.
 */

/** ZKTeco verify modes as reported by the device (subset relevant to MB20-VL). */
export type VerifyMode =
  | "password"
  | "fingerprint"
  | "card"
  | "face"
  | "other";

/** Direction of a punch. Devices may not always report this; resolution logic infers when absent. */
export type PunchType = "in" | "out" | "unknown";

/**
 * A single attendance punch, normalized from whatever the device sent.
 * `deviceSerial` + `deviceUserId` are the raw identifiers from the device;
 * mapping to internal staff/device rows happens in the sink.
 */
export interface NormalizedPunch {
  /** Device serial number (SN) as reported by the terminal. */
  deviceSerial: string;
  /** The user id as enrolled on the device (maps to staff.device_user_id). */
  deviceUserId: string;
  /** When the punch occurred, as an ISO-8601 string in the device's clock. */
  timestamp: string;
  verifyMode: VerifyMode;
  punchType: PunchType;
  /** Raw source line/record for debugging and audit. */
  raw?: string;
}

/**
 * Where normalized punches go. The api provides a concrete implementation that
 * writes to `attendance_events` (resolving serial/user ids to internal rows).
 */
export interface PunchSink {
  /** Persist a batch of punches. Implementations should be idempotent. */
  ingest(punches: NormalizedPunch[]): Promise<PunchIngestResult>;
}

export interface PunchIngestResult {
  accepted: number;
  /** Punches skipped because the device/user could not be resolved. */
  skipped: number;
}

/**
 * A sync adapter connects a device (or a class of devices) to a {@link PunchSink}.
 * PushAdapter is event-driven (fed by the HTTP listener); PollAdapter runs a
 * timer loop that pulls from devices. Both expose the same lifecycle.
 */
export interface SyncAdapter {
  readonly mode: "push" | "poll";
  /** Begin operating (register listeners / start the poll loop). */
  start(): Promise<void>;
  /** Stop cleanly (unregister / cancel timers / close sockets). */
  stop(): Promise<void>;
}
