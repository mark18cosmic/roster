"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type LeaveRequest, type Staff } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function LeavePage() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<LeaveRequest[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState({ staffId: "", startDate: "", endDate: "", type: "annual", reason: "" });

  const load = useCallback(async () => {
    try {
      const q = filter ? `?status=${filter}` : "";
      setRows(await api.get<LeaveRequest[]>(`/api/leave${q}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api.get<Staff[]>("/api/staff").then(setStaff).catch(() => {});
  }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    try {
      await api.post(`/api/leave/${id}/decision`, { decision });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function create() {
    try {
      await api.post("/api/leave", draft);
      dialogRef.current?.close();
      setDraft({ staffId: "", startDate: "", endDate: "", type: "annual", reason: "" });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const badge = (s: string) =>
    s === "approved" ? "ok" : s === "rejected" ? "danger" : "warn";

  return (
    <div>
      <div className="toolbar">
        <h2>Leave requests</h2>
        <button className="primary" onClick={() => dialogRef.current?.showModal()}>
          + New request
        </button>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <div>
          <label>Status</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      <table>
        <thead>
          <tr>
            <th>Staff</th>
            <th>Dates</th>
            <th>Type</th>
            <th>Reason</th>
            <th>Status</th>
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.staffName}</td>
              <td>
                {r.startDate} → {r.endDate}
              </td>
              <td>{r.type}</td>
              <td>{r.reason ?? "—"}</td>
              <td>
                <span className={`badge ${badge(r.status)}`}>{r.status}</span>
              </td>
              {isAdmin && (
                <td>
                  {r.status === "pending" ? (
                    <>
                      <button className="primary" onClick={() => decide(r.id, "approved")}>
                        Approve
                      </button>{" "}
                      <button className="danger" onClick={() => decide(r.id, "rejected")}>
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="muted">decided</span>
                  )}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No leave requests.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <dialog ref={dialogRef}>
        <h3 style={{ marginTop: 0 }}>New leave request</h3>
        <div className="field">
          <label>Staff</label>
          <select
            value={draft.staffId}
            onChange={(e) => setDraft({ ...draft, staffId: e.target.value })}
            style={{ width: "100%" }}
          >
            <option value="">Select…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="field">
            <label>Start</label>
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>End</label>
            <input
              type="date"
              value={draft.endDate}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="annual">Annual</option>
              <option value="sick">Sick</option>
              <option value="unpaid">Unpaid</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Reason</label>
          <input
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            style={{ width: "100%" }}
          />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button
            className="primary"
            onClick={create}
            disabled={!draft.staffId || !draft.startDate || !draft.endDate}
          >
            Submit
          </button>
        </div>
      </dialog>
    </div>
  );
}
