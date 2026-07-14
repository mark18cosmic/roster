import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { sign, verify } from "hono/jwt";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export type AuthRole = "admin" | "staff-viewer";

export interface AuthClaims {
  sub: string; // user id
  orgId: string;
  email: string;
  role: AuthRole;
  exp: number;
  // Allow use as a hono JWTPayload (which requires an index signature).
  [key: string]: unknown;
}

// Hono context variables set by requireAuth.
export type AuthVariables = { auth: AuthClaims };

function expiresAtSeconds(): number {
  // Support "12h", "30m", "7d", or a raw seconds number.
  const raw = config.auth.jwtExpiresIn;
  const m = raw.match(/^(\d+)([smhd])?$/);
  const now = Math.floor(Date.now() / 1000);
  if (!m) return now + 12 * 3600;
  const n = Number.parseInt(m[1]!, 10);
  const unit = m[2] ?? "s";
  const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return now + n * mult;
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; role: AuthRole } } | null> {
  const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const claims: AuthClaims = {
    sub: user.id,
    orgId: user.orgId,
    email: user.email,
    role: user.role,
    exp: expiresAtSeconds(),
  };
  const token = await sign(claims, config.auth.jwtSecret, "HS256");
  return { token, user: { id: user.id, email: user.email, role: user.role } };
}

/** Middleware: require a valid JWT. Populates c.get("auth"). */
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) return c.json({ error: "unauthorized" }, 401);
  const token = header.slice(7);
  try {
    const payload = (await verify(token, config.auth.jwtSecret, "HS256")) as unknown as AuthClaims;
    c.set("auth", payload);
    await next();
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
}

/** Middleware factory: require one of the given roles (run after requireAuth). */
export function requireRole(...roles: AuthRole[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get("auth") as AuthClaims | undefined;
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    if (!roles.includes(auth.role)) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}
