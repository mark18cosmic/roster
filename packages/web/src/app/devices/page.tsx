"use client";

import { useEffect, useState } from "react";
import { api, type Device } from "../../lib/api";

function since(iso: string | null) {
  if (!iso) return "never";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function DevicesPage() {
  const [rows, setRows] = useState<Device[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await api.get<Device[]>("/api/devices"));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresh health periodically
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="toolbar">
        <h2>Device health</h2>
        <button onClick={load}>Refresh</button>
      </div>
      {err && <div className="err">{err}</div>}
      <table>
        <thead>
          <tr>
            <th>Serial</th>
            <th>Location</th>
            <th>Mode</th>
            <th>Address</th>
            <th>Last heartbeat</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>
                <code>{d.serial}</code>
              </td>
              <td>{d.location ?? "—"}</td>
              <td>
                <span className="badge muted">{d.syncMode}</span>
              </td>
              <td>{d.ipAddress ? `${d.ipAddress}:${d.port}` : "—"}</td>
              <td>{since(d.lastHeartbeat)}</td>
              <td>
                <span className={`badge ${d.online ? "ok" : "danger"}`}>
                  {d.online ? "online" : "offline"}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No devices registered.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12 }}>
        A device shows offline when its last heartbeat exceeds the configured threshold
        (DEVICE_OFFLINE_THRESHOLD_SECONDS).
      </p>
    </div>
  );
}
