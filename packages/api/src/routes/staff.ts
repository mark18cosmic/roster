import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AuthVariables } from "../auth/auth.js";
import { requireRole } from "../auth/auth.js";
import { db } from "../db/client.js";
import { staff } from "../db/schema.js";

export const staffRoutes = new Hono<{ Variables: AuthVariables }>();

// List staff for the caller's org.
staffRoutes.get("/", async (c) => {
  const { orgId } = c.get("auth");
  const rows = await db.select().from(staff).where(eq(staff.orgId, orgId));
  return c.json(rows);
});

staffRoutes.get("/:id", async (c) => {
  const { orgId } = c.get("auth");
  const row = (
    await db
      .select()
      .from(staff)
      .where(and(eq(staff.id, c.req.param("id")!), eq(staff.orgId, orgId)))
      .limit(1)
  )[0];
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

staffRoutes.post("/", requireRole("admin"), async (c) => {
  const { orgId } = c.get("auth");
  const body = await c.req.json();
  if (!body?.name) return c.json({ error: "name is required" }, 400);
  const [row] = await db
    .insert(staff)
    .values({
      orgId,
      name: body.name,
      role: body.role ?? null,
      contact: body.contact ?? null,
      hireDate: body.hireDate ?? null,
      deviceUserId: body.deviceUserId ?? null,
      active: body.active ?? true,
    })
    .returning();
  return c.json(row, 201);
});

staffRoutes.patch("/:id", requireRole("admin"), async (c) => {
  const { orgId } = c.get("auth");
  const body = await c.req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "role", "contact", "hireDate", "deviceUserId", "active"]) {
    if (k in body) patch[k] = body[k];
  }
  const [row] = await db
    .update(staff)
    .set(patch)
    .where(and(eq(staff.id, c.req.param("id")!), eq(staff.orgId, orgId)))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

staffRoutes.delete("/:id", requireRole("admin"), async (c) => {
  const { orgId } = c.get("auth");
  const [row] = await db
    .delete(staff)
    .where(and(eq(staff.id, c.req.param("id")!), eq(staff.orgId, orgId)))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});
