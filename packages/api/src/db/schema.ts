import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Multi-tenant from day one: every domain row carries org_id even though a
 * single deployment serves one org in v1. This keeps queries and future
 * tenanting honest.
 */

export const staffRoleEnum = pgEnum("staff_role", ["admin", "staff-viewer", "member"]);
export const syncModeEnum = pgEnum("sync_mode", ["push", "poll"]);
export const verifyModeEnum = pgEnum("verify_mode", [
  "password",
  "fingerprint",
  "card",
  "face",
  "other",
]);
export const punchTypeEnum = pgEnum("punch_type", ["in", "out", "unknown"]);
export const leaveTypeEnum = pgEnum("leave_type", ["annual", "sick", "unpaid", "other"]);
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected"]);
export const authRoleEnum = pgEnum("auth_role", ["admin", "staff-viewer"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Admin/staff-viewer login accounts. Separate from `staff` (device users). */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: authRoleEnum("role").notNull().default("staff-viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUnq: unique("users_email_unq").on(t.email),
  }),
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    contact: text("contact"),
    hireDate: date("hire_date"),
    /** The user id as enrolled on the biometric device. Maps device punches to staff. */
    deviceUserId: text("device_user_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Device user ids are unique per org (a device enrolls a given id once).
    orgDeviceUserUnq: unique("staff_org_device_user_unq").on(t.orgId, t.deviceUserId),
  }),
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    serial: text("serial").notNull(),
    location: text("location"),
    syncMode: syncModeEnum("sync_mode").notNull().default("push"),
    /** For poll mode: how to reach the device on the LAN. */
    ipAddress: text("ip_address"),
    port: integer("port").notNull().default(4370),
    lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    serialUnq: unique("devices_serial_unq").on(t.serial),
  }),
);

export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    verifyMode: verifyModeEnum("verify_mode").notNull().default("other"),
    punchType: punchTypeEnum("punch_type").notNull().default("unknown"),
    /** Raw device identifiers, kept for audit and for events we couldn't map. */
    deviceSerial: text("device_serial").notNull(),
    deviceUserId: text("device_user_id").notNull(),
    raw: text("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency key: the same physical punch (device+user+time) lands once,
    // no matter how many times push/poll delivers it.
    dedupeUnq: unique("attendance_events_dedupe_unq").on(
      t.deviceSerial,
      t.deviceUserId,
      t.timestamp,
    ),
    staffTimeIdx: index("attendance_events_staff_time_idx").on(t.staffId, t.timestamp),
  }),
);

export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    firstIn: timestamp("first_in", { withTimezone: true }),
    lastOut: timestamp("last_out", { withTimezone: true }),
    hours: numeric("hours", { precision: 5, scale: 2 }),
    lateFlag: boolean("late_flag").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    staffDateUnq: unique("attendance_days_staff_date_unq").on(t.staffId, t.date),
  }),
);

export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: leaveTypeEnum("type").notNull().default("annual"),
  status: leaveStatusEnum("status").notNull().default("pending"),
  reason: text("reason"),
  approverId: uuid("approver_id").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Convenience type exports for the rest of the api.
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type AttendanceEvent = typeof attendanceEvents.$inferSelect;
export type AttendanceDay = typeof attendanceDays.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
