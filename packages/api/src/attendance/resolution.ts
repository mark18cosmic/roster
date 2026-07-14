import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { attendanceDays, attendanceEvents } from "../db/schema.js";

/**
 * Derives attendance_days rows from raw attendance_events.
 *
 * Pairing model (v1): for each (staff, calendar day) we take the earliest punch
 * as first_in and the latest as last_out, and compute worked hours as the span
 * between them. This is deliberately simple — it handles the common single
 * in/out pair and multiple punches without needing perfect in/out labels from
 * the device (which the MB20-VL doesn't always provide reliably).
 *
 * late_flag is set when first_in is later than `lateThreshold` (local HH:MM).
 */

const DEFAULT_LATE_THRESHOLD = process.env.LATE_THRESHOLD ?? "09:00";

export interface ResolveOptions {
  /** Only recompute days on/after this date (YYYY-MM-DD). Defaults to all. */
  since?: string;
  lateThreshold?: string;
}

export async function resolveAttendanceDays(db: DB, opts: ResolveOptions = {}): Promise<number> {
  const lateThreshold = opts.lateThreshold ?? DEFAULT_LATE_THRESHOLD;
  const [lateH, lateM] = lateThreshold.split(":").map((n) => Number.parseInt(n, 10));

  // Aggregate events per staff per day. Events with no staff mapping are ignored.
  const filters = [isNotNull(attendanceEvents.staffId)];
  if (opts.since) filters.push(gte(attendanceEvents.timestamp, new Date(opts.since)));

  const rows = await db
    .select({
      orgId: attendanceEvents.orgId,
      staffId: attendanceEvents.staffId,
      day: sql<string>`(${attendanceEvents.timestamp})::date`.as("day"),
      firstIn: sql<Date>`min(${attendanceEvents.timestamp})`.as("first_in"),
      lastOut: sql<Date>`max(${attendanceEvents.timestamp})`.as("last_out"),
    })
    .from(attendanceEvents)
    .where(and(...filters))
    .groupBy(attendanceEvents.orgId, attendanceEvents.staffId, sql`(${attendanceEvents.timestamp})::date`);

  let upserts = 0;
  for (const r of rows) {
    if (!r.staffId) continue;
    const firstIn = new Date(r.firstIn);
    const lastOut = new Date(r.lastOut);
    const hours = Math.max(0, (lastOut.getTime() - firstIn.getTime()) / 3_600_000);

    const lateCutoff = new Date(firstIn);
    lateCutoff.setHours(lateH ?? 9, lateM ?? 0, 0, 0);
    const lateFlag = firstIn.getTime() > lateCutoff.getTime();

    await db
      .insert(attendanceDays)
      .values({
        orgId: r.orgId,
        staffId: r.staffId,
        date: r.day,
        firstIn,
        lastOut,
        hours: hours.toFixed(2),
        lateFlag,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [attendanceDays.staffId, attendanceDays.date],
        set: {
          firstIn,
          lastOut,
          hours: hours.toFixed(2),
          lateFlag,
          updatedAt: new Date(),
        },
      });
    upserts++;
  }
  return upserts;
}
