// Thin browser API client. Reads the JWT from localStorage and talks to the
// Hono api. All calls are client-side (this is an internal admin console).

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

const TOKEN_KEY = "roster_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "unauthorized");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ---- Shared shapes (mirror the api's responses) ----
export type Role = "admin" | "staff-viewer";
export interface Me {
  id: string;
  email: string;
  role: Role;
  orgId: string;
}
export interface Staff {
  id: string;
  name: string;
  role: string | null;
  contact: string | null;
  hireDate: string | null;
  deviceUserId: string | null;
  active: boolean;
}
export interface Device {
  id: string;
  serial: string;
  location: string | null;
  syncMode: "push" | "poll";
  ipAddress: string | null;
  port: number;
  lastHeartbeat: string | null;
  online: boolean;
  offlineThresholdSeconds: number;
}
export interface AttendanceDay {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  firstIn: string | null;
  lastOut: string | null;
  hours: string | null;
  lateFlag: boolean;
}
export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  type: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  approverId: string | null;
  decidedAt: string | null;
  createdAt: string;
}
export interface Overview {
  syncMode: string;
  date: string;
  staffActive: number;
  presentToday: number;
  lateToday: number;
  pendingLeave: number;
  devices: { total: number; online: number; offline: number };
}
