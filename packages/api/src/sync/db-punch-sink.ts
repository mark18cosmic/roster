import type { NormalizedPunch, PunchIngestResult, PunchSink } from "@roster/shared";
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client.js";
import { attendanceEvents, devices, staff } from "../db/schema.js";

/**
 * The single sink both sync modes write through. Resolves raw device/user
 * identifiers to internal rows and inserts into attendance_events with
 * dedup (device+user+timestamp is a unique key, so replays are harmless).
 *
 * Unmapped punches (unknown device, or a device_user_id with no staff row)
 * are still stored — staffId is left null — so nothing is silently lost and
 * the mapping UI can surface them later. They count as "skipped" in the result.
 */
export class DbPunchSink implements PunchSink {
  constructor(private readonly db: DB) {}

  async ingest(punches: NormalizedPunch[]): Promise<PunchIngestResult> {
    let accepted = 0;
    let skipped = 0;

    for (const p of punches) {
      const device = (
        await this.db.select().from(devices).where(eq(devices.serial, p.deviceSerial)).limit(1)
      )[0];

      if (!device) {
        // Unknown device — refuse (push listener should have rejected it, but be safe).
        skipped++;
        continue;
      }

      const staffRow = (
        await this.db
          .select()
          .from(staff)
          .where(and(eq(staff.orgId, device.orgId), eq(staff.deviceUserId, p.deviceUserId)))
          .limit(1)
      )[0];

      const inserted = await this.db
        .insert(attendanceEvents)
        .values({
          orgId: device.orgId,
          staffId: staffRow?.id ?? null,
          deviceId: device.id,
          timestamp: new Date(p.timestamp),
          verifyMode: p.verifyMode,
          punchType: p.punchType,
          deviceSerial: p.deviceSerial,
          deviceUserId: p.deviceUserId,
          raw: p.raw ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: attendanceEvents.id });

      // Touch device heartbeat on any contact.
      await this.db
        .update(devices)
        .set({ lastHeartbeat: new Date() })
        .where(eq(devices.id, device.id));

      if (inserted.length > 0 && staffRow) accepted++;
      else skipped++;
    }

    return { accepted, skipped };
  }
}
