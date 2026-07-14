"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Staff } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

export default function StaffPage() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<Staff[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Staff> | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function load() {
    try {
      setRows(await api.get<Staff[]>("/api/staff"));
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing({ name: "", role: "", contact: "", deviceUserId: "", active: true });
    dialogRef.current?.showModal();
  }
  function openEdit(s: Staff) {
    setEditing({ ...s });
    dialogRef.current?.showModal();
  }

  async function save() {
    if (!editing) return;
    const payload = {
      name: editing.name,
      role: editing.role || null,
      contact: editing.contact || null,
      deviceUserId: editing.deviceUserId || null,
      active: editing.active ?? true,
    };
    try {
      if (editing.id) await api.patch(`/api/staff/${editing.id}`, payload);
      else await api.post("/api/staff", payload);
      dialogRef.current?.close();
      setEditing(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(s: Staff) {
    if (!confirm(`Delete ${s.name}?`)) return;
    await api.del(`/api/staff/${s.id}`);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Staff directory</h2>
        {isAdmin && (
          <button className="primary" onClick={openNew}>
            + Add staff
          </button>
        )}
      </div>
      {err && <div className="err">{err}</div>}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Contact</th>
            <th>Device user ID</th>
            <th>Status</th>
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                <a href={`/attendance/${s.id}`}>{s.name}</a>
              </td>
              <td>{s.role ?? "—"}</td>
              <td>{s.contact ?? "—"}</td>
              <td>
                {s.deviceUserId ? (
                  <code>{s.deviceUserId}</code>
                ) : (
                  <span className="badge warn">unmapped</span>
                )}
              </td>
              <td>
                <span className={`badge ${s.active ? "ok" : "muted"}`}>
                  {s.active ? "active" : "inactive"}
                </span>
              </td>
              {isAdmin && (
                <td>
                  <button onClick={() => openEdit(s)}>Edit</button>{" "}
                  <button className="danger" onClick={() => remove(s)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No staff yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <dialog ref={dialogRef}>
        <h3 style={{ marginTop: 0 }}>{editing?.id ? "Edit staff" : "Add staff"}</h3>
        {editing && (
          <>
            <div className="field">
              <label>Name</label>
              <input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="field">
              <label>Role</label>
              <input
                value={editing.role ?? ""}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="field">
              <label>Contact</label>
              <input
                value={editing.contact ?? ""}
                onChange={(e) => setEditing({ ...editing, contact: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="field">
              <label>Device user ID (as enrolled on the terminal)</label>
              <input
                value={editing.deviceUserId ?? ""}
                onChange={(e) => setEditing({ ...editing, deviceUserId: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={editing.active ?? true}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />{" "}
                Active
              </label>
            </div>
          </>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              dialogRef.current?.close();
              setEditing(null);
            }}
          >
            Cancel
          </button>
          <button className="primary" onClick={save}>
            Save
          </button>
        </div>
      </dialog>
    </div>
  );
}
