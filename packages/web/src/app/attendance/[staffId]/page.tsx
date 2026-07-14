"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type AttendanceDay, type Staff } from "../../../lib/api";

interface Drill {
  staff: Staff;
  days: AttendanceDay[];
  events: {
    id: string;
    timestamp: string;
    verifyMode: string;
    punchType: string;
    deviceSerial: string;
  }[];
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function StaffDrillPage() {
  const params = useParams<{ staffId: string }>();
  const [data, setData] = useState<Drill | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Drill>(`/api/attendance/staff/${params.staffId}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [params.staffId]);

  if (err) return <div className="err">{err}</div>;
  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <p>
        <a href="/attendance">← Attendance</a>
      </p>
      <h2>{data.staff.name}</h2>
      <p className="muted">
        {data.staff.role ?? "—"} · device user ID{" "}
        {data.staff.deviceUserId ? <code>{data.staff.deviceUserId}</code> : "(unmapped)"}
      </p>

      <h3>Recent days</h3>
      <table style={{ marginBottom: 24 }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>First in</th>
            <th>Last out</th>
            <th>Hours</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {data.days.map((d) => (
            <tr key={d.id}>
              <td>{d.date}</td>
              <td>{fmt(d.firstIn)}</td>
              <td>{fmt(d.lastOut)}</td>
              <td>{d.hours ?? "—"}</td>
              <td>{d.lateFlag ? <span className="badge warn">late</span> : ""}</td>
            </tr>
          ))}
          {data.days.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No resolved days.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Raw punches</h3>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Verify</th>
            <th>Device</th>
          </tr>
        </thead>
        <tbody>
          {data.events.map((e) => (
            <tr key={e.id}>
              <td>{fmt(e.timestamp)}</td>
              <td>{e.punchType}</td>
              <td>{e.verifyMode}</td>
              <td>
                <code>{e.deviceSerial}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
