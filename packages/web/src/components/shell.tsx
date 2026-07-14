"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "../lib/auth-context";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/staff", label: "Staff" },
  { href: "/attendance", label: "Attendance" },
  { href: "/leave", label: "Leave" },
  { href: "/devices", label: "Devices" },
];

/**
 * App chrome + client-side auth gate. Unauthenticated users are redirected to
 * /login; the login page itself renders without the shell.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (!loading && !me && !isLogin) router.replace("/login");
  }, [loading, me, isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (loading) return <div className="content">Loading…</div>;
  if (!me) return <div className="content">Redirecting to login…</div>;

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Roster</h1>
        <p className="tag">{me.email}</p>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={pathname === n.href ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 20, paddingLeft: 10 }}>
          <span className={`badge ${me.role === "admin" ? "ok" : "muted"}`}>{me.role}</span>
          <button style={{ marginTop: 16, display: "block" }} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
