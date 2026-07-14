"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Device } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

function since(iso: string | null) {
  if (!iso) return "never";
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

type Draft = Partial<Device>;

const EMPTY_DRAFT: Draft = { serial: "", location: "", syncMode: "push", ipAddress: "", port: 4370 };

export default function DevicesPage() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const [rows, setRows] = useState<Device[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function load() {
    try {
      setRows(await api.get<Device[]>("/api/devices"));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresh health periodically
    return () => clearInterval(t);
  }, []);

  function openNew() {
    setEditing({ ...EMPTY_DRAFT });
    dialogRef.current?.showModal();
  }
  function openEdit(d: Device) {
    setEditing({ ...d });
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
    setEditing(null);
  }

  async function save() {
    if (!editing) return;
    setErr(null);
    const isPoll = editing.syncMode === "poll";
    try {
      if (editing.id) {
        // PATCH — serial is immutable; only config fields change.
        await api.patch(`/api/devices/${editing.id}`, {
          location: editing.location || null,
          syncMode: editing.syncMode,
          ipAddress: isPoll ? editing.ipAddress || null : null,
          port: editing.port ?? 4370,
        });
      } else {
        if (!editing.serial?.trim()) {
          setErr("Serial is required.");
          return;
        }
        await api.post("/api/devices", {
          serial: editing.serial.trim(),
          location: editing.location || null,
          syncMode: editing.syncMode,
          ipAddress: isPoll ? editing.ipAddress || null : null,
          port: editing.port ?? 4370,
        });
      }
      close();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(d: Device) {
    if (!confirm(`Delete device ${d.serial}? Its past attendance events are kept.`)) return;
    try {
      await api.del(`/api/devices/${d.id}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const isPoll = editing?.syncMode === "poll";

  return (
    <div>
      <div className="toolbar">
        <h2>Device health</h2>
        <div className="row">
          <button onClick={load}>Refresh</button>
          {isAdmin && (
            <button className="primary" onClick={openNew}>
              + Add device
            </button>
          )}
        </div>
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
            {isAdmin && <th></th>}
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
              <td>{d.syncMode === "poll" && d.ipAddress ? `${d.ipAddress}:${d.port}` : "—"}</td>
              <td>{since(d.lastHeartbeat)}</td>
              <td>
                <span className={`badge ${d.online ? "ok" : "danger"}`}>
                  {d.online ? "online" : "offline"}
                </span>
              </td>
              {isAdmin && (
                <td>
                  <button onClick={() => openEdit(d)}>Edit</button>{" "}
                  <button className="danger" onClick={() => remove(d)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 7 : 6} className="muted">
                No devices registered.{isAdmin ? " Click “Add device” to register one." : ""}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12 }}>
        A device shows offline when its last heartbeat exceeds the configured threshold
        (DEVICE_OFFLINE_THRESHOLD_SECONDS).
      </p>

      <dialog ref={dialogRef}>
        <h3 style={{ marginTop: 0 }}>{editing?.id ? "Configure device" : "Add device"}</h3>
        {editing && (
          <>
            <div className="field">
              <label>Serial number {editing.id ? "(immutable)" : "(from the terminal)"}</label>
              <input
                value={editing.serial ?? ""}
                onChange={(e) => setEditing({ ...editing, serial: e.target.value })}
                disabled={!!editing.id}
                placeholder="e.g. ABC1234567"
                style={{ width: "100%" }}
              />
            </div>
            <div className="field">
              <label>Location</label>
              <input
                value={editing.location ?? ""}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                placeholder="e.g. Front Door"
                style={{ width: "100%" }}
              />
            </div>
            <div className="field">
              <label>Sync mode</label>
              <select
                value={editing.syncMode ?? "push"}
                onChange={(e) =>
                  setEditing({ ...editing, syncMode: e.target.value as "push" | "poll" })
                }
                style={{ width: "100%" }}
              >
                <option value="push">push — device calls the server (ADMS)</option>
                <option value="poll">poll — server connects to the device (TCP 4370)</option>
              </select>
            </div>
            {isPoll && (
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Device IP address</label>
                  <input
                    value={editing.ipAddress ?? ""}
                    onChange={(e) => setEditing({ ...editing, ipAddress: e.target.value })}
                    placeholder="e.g. 192.168.1.50"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Port</label>
                  <input
                    type="number"
                    value={editing.port ?? 4370}
                    onChange={(e) =>
                      setEditing({ ...editing, port: Number.parseInt(e.target.value, 10) || 4370 })
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            )}
            {isPoll && (
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                Poll mode requires the server to reach this IP on the given port. For a cloud server
                with an on-prem device behind NAT, use push mode instead.
              </p>
            )}
          </>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={save}>
            {editing?.id ? "Save" : "Add device"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
