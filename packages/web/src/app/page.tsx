"use client";

import { useEffect, useState } from "react";
import { api, type Overview } from "../lib/api";

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Overview>("/api/dashboard/overview")
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="err">{err}</div>;
  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <div className="toolbar">
        <h2>Overview</h2>
        <span className="badge muted">
          Sync mode: {data.syncMode} · {data.date}
        </span>
      </div>
      <div className="cards">
        <Card n={data.staffActive} l="Active staff" />
        <Card n={data.presentToday} l="Present today" />
        <Card n={data.lateToday} l="Late today" tone={data.lateToday ? "warn" : undefined} />
        <Card n={data.pendingLeave} l="Pending leave" tone={data.pendingLeave ? "warn" : undefined} />
        <Card
          n={`${data.devices.online}/${data.devices.total}`}
          l="Devices online"
          tone={data.devices.offline ? "danger" : "ok"}
        />
      </div>
    </div>
  );
}

function Card({ n, l, tone }: { n: number | string; l: string; tone?: "ok" | "warn" | "danger" }) {
  const color =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "ok"
          ? "var(--ok)"
          : "var(--text)";
  return (
    <div className="card">
      <div className="n" style={{ color }}>
        {n}
      </div>
      <div className="l">{l}</div>
    </div>
  );
}
