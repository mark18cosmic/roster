import bcrypt from "bcryptjs";
import { eq, sql as dsql } from "drizzle-orm";
import { db, sql } from "./client.js";
import { devices, organizations, staff, users } from "./schema.js";

/**
 * Idempotent seed: one org, an admin + staff-viewer login, a handful of staff,
 * and the simulator's device so push mode is accepted out of the box.
 * Safe to run repeatedly.
 */
async function main() {
  console.log("[seed] seeding…");

  const orgName = "Acme Corp";
  const [org] = await db
    .insert(organizations)
    .values({ name: orgName })
    .onConflictDoNothing()
    .returning();

  const orgId =
    org?.id ??
    (await db.select().from(organizations).where(eq(organizations.name, orgName)).limit(1))[0]!.id;

  // Auth users
  const adminHash = await bcrypt.hash("admin123", 10);
  const viewerHash = await bcrypt.hash("viewer123", 10);
  await db
    .insert(users)
    .values([
      { orgId, email: "admin@acme.test", passwordHash: adminHash, role: "admin" },
      { orgId, email: "viewer@acme.test", passwordHash: viewerHash, role: "staff-viewer" },
    ])
    .onConflictDoNothing();

  // Staff with device_user_id mapping
  await db
    .insert(staff)
    .values([
      { orgId, name: "Alice Ng", role: "Manager", contact: "alice@acme.test", deviceUserId: "1" },
      { orgId, name: "Bob Tan", role: "Technician", contact: "bob@acme.test", deviceUserId: "2" },
      { orgId, name: "Carol Lim", role: "Clerk", contact: "carol@acme.test", deviceUserId: "3" },
    ])
    .onConflictDoNothing();

  // Simulator device (serial must match SIM_DEVICE_SERIAL for push to be accepted).
  await db
    .insert(devices)
    .values({
      orgId,
      serial: process.env.SIM_DEVICE_SERIAL ?? "MB20VL-SIM-0001",
      location: "Front Door (Simulator)",
      syncMode: "push",
      ipAddress: "127.0.0.1",
      port: 4370,
    })
    .onConflictDoNothing();

  const counts = await db.execute(
    dsql`select
      (select count(*) from staff) as staff,
      (select count(*) from devices) as devices,
      (select count(*) from users) as users`,
  );
  console.log("[seed] done:", counts[0]);
  await sql.end();
}

main().catch(async (err) => {
  console.error("[seed] failed:", err);
  await sql.end();
  process.exit(1);
});
