import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/auth.js";
import { requireRole } from "../auth/auth.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { devices } from "../db/schema.js";

export const deviceRoutes = new Hono<{ Variables: AuthVariables }>();

const OFFLINE_SECONDS = config.sync.deviceOfflineThresholdSeconds;

/** Adds derived `online` status from last_heartbeat vs the offline threshold. */
function withHealth<T extends { lastHeartbeat: Date | null }>(d: T) {
  const online =
    d.lastHeartbeat != null &&
    Date.now() - new Date(d.lastHeartbeat).getTime() < OFFLINE_SECONDS * 1000;
  return { ...d, online, offlineThresholdSeconds: OFFLINE_SECONDS };
}

deviceRoutes.get("/", async (c) => {
  const { orgId } = c.get("auth");
  const rows = await db.select().from(devices).where(eq(devices.orgId, orgId));
  return c.json(rows.map(withHealth));
});

deviceRoutes.get("/:id", async (c) => {
  const { orgId } = c.get("auth");
  const row = (
    await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, c.req.param("id")!), eq(devices.orgId, orgId)))
      .limit(1)
  )[0];
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(withHealth(row));
});

deviceRoutes.post("/", requireRole("admin"), async (c) => {
  const { orgId } = c.get("auth");
  const body = await c.req.json();
  if (!body?.serial) return c.json({ error: "serial is required" }, 400);
  const [row] = await db
    .insert(devices)
    .values({
      orgId,
      serial: body.serial,
      location: body.location ?? null,
      syncMode: body.syncMode ?? "push",
      ipAddress: body.ipAddress ?? null,
      port: body.port ?? 4370,
    })
    .returning();
  return c.json(withHealth(row!), 201);
});

deviceRoutes.patch("/:id", requireRole("admin"), async (c) => {
  const { orgId } = c.get("auth");
  const body = await c.req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["location", "syncMode", "ipAddress", "port"]) {
    if (k in body) patch[k] = body[k];
  }
  const [row] = await db
    .update(devices)
    .set(patch)
    .where(and(eq(devices.id, c.req.param("id")!), eq(devices.orgId, orgId)))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(withHealth(row));
});

deviceRoutes.delete("/:id", requireRole("admin"), async (c) => {
  const { orgId } = c.get("auth");
  const [row] = await db
    .delete(devices)
    .where(and(eq(devices.id, c.req.param("id")!), eq(devices.orgId, orgId)))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// Health summary for the dashboard.
deviceRoutes.get("/health/summary", async (c) => {
  const { orgId } = c.get("auth");
  const rows = await db.select().from(devices).where(eq(devices.orgId, orgId));
  const health = rows.map(withHealth);
  return c.json({
    total: health.length,
    online: health.filter((d) => d.online).length,
    offline: health.filter((d) => !d.online).length,
    devices: health,
  });
});
