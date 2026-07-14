"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type AttendanceDay } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AttendancePage() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<AttendanceDay[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<AttendanceDay[]>(`/api/attendance/days?from=${from}&to=${to}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function resolve() {
    setMsg(null);
    try {
      const r = await api.post<{ daysResolved: number }>("/api/attendance/resolve", {});
      setMsg(`Resolved ${r.daysResolved} day(s) from raw events.`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Attendance</h2>
        {isAdmin && (
          <button className="primary" onClick={resolve}>
            Re-resolve from events
          </button>
        )}
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <div>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {msg && <div className="muted">{msg}</div>}
      {err && <div className="err">{err}</div>}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Staff</th>
            <th>First in</th>
            <th>Last out</th>
            <th>Hours</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{d.date}</td>
              <td>
                <a href={`/attendance/${d.staffId}`}>{d.staffName}</a>
              </td>
              <td>{fmtTime(d.firstIn)}</td>
              <td>{fmtTime(d.lastOut)}</td>
              <td>{d.hours ?? "—"}</td>
              <td>{d.lateFlag ? <span className="badge warn">late</span> : <span className="badge ok">on time</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No attendance in range. Push punches with the simulator, then Re-resolve.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
