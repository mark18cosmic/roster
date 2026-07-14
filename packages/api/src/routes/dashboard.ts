import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/auth.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { attendanceDays, devices, leaveRequests, staff } from "../db/schema.js";

export const dashboardRoutes = new Hono<{ Variables: AuthVariables }>();

// Admin overview: headline counts for the dashboard landing page.
dashboardRoutes.get("/overview", async (c) => {
  const { orgId } = c.get("auth");
  const today = new Date().toISOString().slice(0, 10);
  const offlineMs = config.sync.deviceOfflineThresholdSeconds * 1000;

  const [staffCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staff)
    .where(and(eq(staff.orgId, orgId), eq(staff.active, true)));

  const [presentToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attendanceDays)
    .where(and(eq(attendanceDays.orgId, orgId), eq(attendanceDays.date, today)));

  const [lateToday] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.orgId, orgId),
        eq(attendanceDays.date, today),
        eq(attendanceDays.lateFlag, true),
      ),
    );

  const [pendingLeave] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.status, "pending")));

  const deviceRows = await db.select().from(devices).where(eq(devices.orgId, orgId));
  const onlineDevices = deviceRows.filter(
    (d) => d.lastHeartbeat && Date.now() - new Date(d.lastHeartbeat).getTime() < offlineMs,
  ).length;

  return c.json({
    syncMode: config.sync.mode,
    date: today,
    staffActive: staffCount?.n ?? 0,
    presentToday: presentToday?.n ?? 0,
    lateToday: lateToday?.n ?? 0,
    pendingLeave: pendingLeave?.n ?? 0,
    devices: { total: deviceRows.length, online: onlineDevices, offline: deviceRows.length - onlineDevices },
  });
});
