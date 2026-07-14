import { Hono } from "hono";
import type { AuthVariables } from "../auth/auth.js";
import { login } from "../auth/auth.js";

/** Public: obtain a token. */
export const authPublicRoutes = new Hono();

authPublicRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body?.email || !body?.password) {
    return c.json({ error: "email and password required" }, 400);
  }
  const result = await login(body.email, body.password);
  if (!result) return c.json({ error: "invalid credentials" }, 401);
  return c.json(result);
});

/** Gated: mounted behind requireAuth. Returns the current token's claims. */
export const authMeRoutes = new Hono<{ Variables: AuthVariables }>();

authMeRoutes.get("/me", (c) => {
  const auth = c.get("auth");
  return c.json({ id: auth.sub, email: auth.email, role: auth.role, orgId: auth.orgId });
});
