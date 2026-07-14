import { serve } from "@hono/node-server";
import type { SyncAdapter } from "@roster/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requireAuth } from "./auth/auth.js";
import type { AuthVariables } from "./auth/auth.js";
import { config } from "./config.js";
import { db } from "./db/client.js";
import { attendanceRoutes } from "./routes/attendance.js";
import { authMeRoutes, authPublicRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { deviceRoutes } from "./routes/devices.js";
import { leaveRoutes } from "./routes/leave.js";
import { staffRoutes } from "./routes/staff.js";
import { DbPunchSink } from "./sync/db-punch-sink.js";
import { PollAdapter } from "./sync/poll-adapter.js";
import { PushAdapter } from "./sync/push-adapter.js";

const app = new Hono<{ Variables: AuthVariables }>();
app.use("*", logger());
app.use("*", cors());

// --- Public ---
app.get("/health", (c) =>
  c.json({ status: "ok", service: "roster-api", syncMode: config.sync.mode, time: new Date().toISOString() }),
);
app.get("/", (c) => c.text("Roster API"));

// --- Device sync (adapter chosen by SYNC_MODE) ---
// The shared sink is what both modes write through; swapping modes is config only.
const sink = new DbPunchSink(db);
let adapter: SyncAdapter;
if (config.sync.mode === "push") {
  const push = new PushAdapter(db, sink, { sharedKey: config.sync.admsSharedKey });
  // ADMS endpoints live under /iclock and are authenticated by serial + key,
  // NOT by JWT — the device can't present a bearer token.
  app.route("/iclock", push.routes());
  adapter = push;
} else {
  adapter = new PollAdapter(db, sink, {
    intervalSeconds: config.sync.pollIntervalSeconds,
    defaultPort: config.sync.zkDevicePort,
  });
}

// --- Auth: login is public, everything else requires a bearer token ---
app.route("/api/auth", authPublicRoutes); // public: POST /api/auth/login

const api = new Hono<{ Variables: AuthVariables }>();
api.use("*", requireAuth);
api.route("/auth", authMeRoutes); // gated: GET /api/auth/me
api.route("/staff", staffRoutes);
api.route("/devices", deviceRoutes);
api.route("/attendance", attendanceRoutes);
api.route("/leave", leaveRoutes);
api.route("/dashboard", dashboardRoutes);
app.route("/api", api);

const server = serve({ fetch: app.fetch, port: config.api.port }, async (info) => {
  console.log(`[roster-api] listening on :${info.port} (SYNC_MODE=${config.sync.mode})`);
  await adapter.start();
});

// Graceful shutdown.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    await adapter.stop();
    server.close();
    process.exit(0);
  });
}
