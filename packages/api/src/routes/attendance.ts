import { and, between, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/auth.js";
import { requireRole } from "../auth/auth.js";
import { resolveAttendanceDays } from "../attendance/resolution.js";
import { db } from "../db/client.js";
import { attendanceDays, attendanceEvents, staff } from "../db/schema.js";

export const attendanceRoutes = new Hono<{ Variables: AuthVariables }>();

// Raw events (most recent first). Optional ?staffId= and ?limit=.
attendanceRoutes.get("/events", async (c) => {
  const { orgId } = c.get("auth");
  const staffId = c.req.query("staffId");
  const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const filters = [eq(attendanceEvents.orgId, orgId)];
  if (staffId) filters.push(eq(attendanceEvents.staffId, staffId));
  const rows = await db
    .select()
    .from(attendanceEvents)
    .where(and(...filters))
    .orderBy(desc(attendanceEvents.timestamp))
    .limit(limit);
  return c.json(rows);
});

// Resolved days, optionally filtered by ?from=&to=&staffId=.
attendanceRoutes.get("/days", async (c) => {
  const { orgId } = c.get("auth");
  const staffId = c.req.query("staffId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const filters = [eq(attendanceDays.orgId, orgId)];
  if (staffId) filters.push(eq(attendanceDays.staffId, staffId));
  if (from && to) filters.push(between(attendanceDays.date, from, to));
  else if (from) filters.push(gte(attendanceDays.date, from));
  else if (to) filters.push(lte(attendanceDays.date, to));

  const rows = await db
    .select({
      id: attendanceDays.id,
      staffId: attendanceDays.staffId,
      staffName: staff.name,
      date: attendanceDays.date,
      firstIn: attendanceDays.firstIn,
      lastOut: attendanceDays.lastOut,
      hours: attendanceDays.hours,
      lateFlag: attendanceDays.lateFlag,
    })
    .from(attendanceDays)
    .innerJoin(staff, eq(staff.id, attendanceDays.staffId))
    .where(and(...filters))
    .orderBy(desc(attendanceDays.date));
  return c.json(rows);
});

// Per-staff drill-down: profile + recent days + recent events.
attendanceRoutes.get("/staff/:staffId", async (c) => {
  const { orgId } = c.get("auth");
  const staffId = c.req.param("staffId")!;
  const person = (
    await db
      .select()
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.orgId, orgId)))
      .limit(1)
  )[0];
  if (!person) return c.json({ error: "not found" }, 404);

  const days = await db
    .select()
    .from(attendanceDays)
    .where(and(eq(attendanceDays.orgId, orgId), eq(attendanceDays.staffId, staffId)))
    .orderBy(desc(attendanceDays.date))
    .limit(60);

  const events = await db
    .select()
    .from(attendanceEvents)
    .where(and(eq(attendanceEvents.orgId, orgId), eq(attendanceEvents.staffId, staffId)))
    .orderBy(desc(attendanceEvents.timestamp))
    .limit(100);

  return c.json({ staff: person, days, events });
});

// Trigger (re)resolution of attendance_days from events. Admin only.
attendanceRoutes.post("/resolve", requireRole("admin"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const count = await resolveAttendanceDays(db, { since: body?.since });
  return c.json({ ok: true, daysResolved: count });
});
