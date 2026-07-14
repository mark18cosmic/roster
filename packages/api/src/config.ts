/**
 * Centralized, validated environment config. Fail fast on missing required
 * vars rather than crashing deep in a request handler.
 */

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer, got: ${v}`);
  return n;
}

const syncMode = optional("SYNC_MODE", "push");
if (syncMode !== "push" && syncMode !== "poll") {
  throw new Error(`SYNC_MODE must be "push" or "poll", got: ${syncMode}`);
}

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  api: {
    port: intEnv("API_PORT", 8080),
    publicUrl: optional("API_PUBLIC_URL", "http://localhost:8080"),
  },
  db: {
    url: required("DATABASE_URL"),
  },
  auth: {
    jwtSecret: optional("JWT_SECRET", "change_me_dev_only_secret"),
    jwtExpiresIn: optional("JWT_EXPIRES_IN", "12h"),
  },
  sync: {
    mode: syncMode as "push" | "poll",
    admsSharedKey: optional("ADMS_SHARED_KEY", ""),
    pollIntervalSeconds: intEnv("POLL_INTERVAL_SECONDS", 30),
    zkDevicePort: intEnv("ZK_DEVICE_PORT", 4370),
    deviceOfflineThresholdSeconds: intEnv("DEVICE_OFFLINE_THRESHOLD_SECONDS", 300),
  },
} as const;

export type Config = typeof config;
