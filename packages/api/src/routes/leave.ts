import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/auth.js";
import { requireRole } from "../auth/auth.js";
import { db } from "../db/client.js";
import { leaveRequests, staff } from "../db/schema.js";

export const leaveRoutes = new Hono<{ Variables: AuthVariables }>();

// List leave requests (optionally ?status= / ?staffId=), newest first.
leaveRoutes.get("/", async (c) => {
  const { orgId } = c.get("auth");
  const status = c.req.query("status");
  const staffId = c.req.query("staffId");
  const filters = [eq(leaveRequests.orgId, orgId)];
  if (status) filters.push(eq(leaveRequests.status, status as "pending" | "approved" | "rejected"));
  if (staffId) filters.push(eq(leaveRequests.staffId, staffId));

  const rows = await db
    .select({
      id: leaveRequests.id,
      staffId: leaveRequests.staffId,
      staffName: staff.name,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      approverId: leaveRequests.approverId,
      decidedAt: leaveRequests.decidedAt,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(staff, eq(staff.id, leaveRequests.staffId))
    .where(and(...filters))
    .orderBy(desc(leaveRequests.createdAt));
  return c.json(rows);
});

// Create a request (any authed user can file on behalf of staff in v1).
leaveRoutes.post("/", async (c) => {
  const { orgId } = c.get("auth");
  const body = await c.req.json();
  if (!body?.staffId || !body?.startDate || !body?.endDate) {
    return c.json({ error: "staffId, startDate, endDate are required" }, 400);
  }
  // Ensure the staff belongs to this org.
  const person = (
    await db
      .select()
      .from(staff)
      .where(and(eq(staff.id, body.staffId), eq(staff.orgId, orgId)))
      .limit(1)
  )[0];
  if (!person) return c.json({ error: "staff not found" }, 404);

  const [row] = await db
    .insert(leaveRequests)
    .values({
      orgId,
      staffId: body.staffId,
      startDate: body.startDate,
      endDate: body.endDate,
      type: body.type ?? "annual",
      reason: body.reason ?? null,
    })
    .returning();
  return c.json(row, 201);
});

// Approve / reject. Admin only.
leaveRoutes.post("/:id/decision", requireRole("admin"), async (c) => {
  const { orgId, sub } = c.get("auth");
  const body = await c.req.json();
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return c.json({ error: 'decision must be "approved" or "rejected"' }, 400);
  }
  const [row] = await db
    .update(leaveRequests)
    .set({ status: decision, approverId: sub, decidedAt: new Date() })
    .where(and(eq(leaveRequests.id, c.req.param("id")!), eq(leaveRequests.orgId, orgId)))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});
