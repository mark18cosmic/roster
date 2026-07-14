# Roster — Installation & Deployment Guide

This guide is written for deploying Roster for a **new customer** — on-prem
(same LAN as the biometric terminal) or in the cloud. The process is identical;
only a few env values differ.

---

## 1. Prerequisites

- Docker + Docker Compose
- A ZKTeco **MB20-VL** terminal (or the bundled simulator for testing)
- Outbound/inbound network per your chosen sync mode (see §4)

## 2. First-time setup

```bash
git clone <repo> roster && cd roster
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET, ADMS_SHARED_KEY, POSTGRES_PASSWORD.
docker compose up --build -d
```

On first boot the `api` container automatically:
1. applies database migrations, then
2. runs the **idempotent** seed (one org, admin + viewer logins, sample staff,
   and the simulator device).

Verify:
- API health: `curl http://localhost:8080/health`
- Web console: http://localhost:3000 (login `admin@acme.test` / `admin123`)

> **Change the seeded passwords immediately** for a real deployment, or replace
> the seed with your own org/admin (see §6).

## 3. Choosing a sync mode

Set `SYNC_MODE` in `.env`:

| Mode   | When to use | Networking |
|--------|-------------|------------|
| `push` | Cloud, or on-prem where the device is configured to call us. Device speaks ADMS to `/iclock/*`. | Device must reach `API_PUBLIC_URL` (expose `API_PORT`). |
| `poll` | On-prem where our backend can reach the device directly. Backend connects to the device on TCP 4370. | API host must reach each device's `ip:port`. |

Switching modes is **config-only** — no code changes. Both paths write the same
`attendance_events` via the shared `SyncAdapter`.

## 4. Configuring the device (push mode)

On the MB20-VL, set the ADMS/Cloud server to:
- Server address: the host of `API_PUBLIC_URL`
- Server port: `API_PORT` (default 8080)
- Append the shared key as configured in `ADMS_SHARED_KEY` (sent as `?key=`).

Register the device in the console (Devices are seeded/added via the API) so its
**serial** is allowlisted — unknown serials are rejected with 401.

## 4b. Configuring poll mode

In `.env` set `SYNC_MODE=poll` and `POLL_INTERVAL_SECONDS`. Register each device
with its `ipAddress` and `port` (4370) and `syncMode=poll`. The poll worker
sweeps all poll-mode devices every interval.

## 5. Testing without hardware (simulator)

The repo ships a mock MB20-VL. With the stack running:

```bash
# Push a day of punches over ADMS (default):
SIM_TARGET_URL=http://localhost:8080 SIM_SHARED_KEY=<your ADMS_SHARED_KEY> \
  npm run simulator

# Or run a mock ZK device on 4370 for poll-mode testing:
npm run simulator -- zk-server
```

Then in the console: **Attendance → Re-resolve from events** to derive
`attendance_days`.

## 6. Onboarding a second customer

Each customer is a separate deployment (single org per deployment in v1, but the
schema is multi-tenant with `org_id` throughout).

1. Provision a fresh host / compose project.
2. `cp .env.example .env` and set customer-specific values:
   - `JWT_SECRET` (unique per customer — `openssl rand -hex 32`)
   - `ADMS_SHARED_KEY` (unique)
   - `POSTGRES_PASSWORD`
   - `API_PUBLIC_URL` / `NEXT_PUBLIC_API_URL` (their host)
   - `SYNC_MODE` for their site
3. Replace the demo seed with the customer's org + admin. Either edit
   `packages/api/src/db/seed.ts`, or after boot use the API to create the real
   admin and delete the demo accounts.
4. `docker compose up --build -d`.
5. Register the customer's real device serial(s) and map staff
   `device_user_id`s in **Staff**.

## 7. Operations

- **Logs:** `docker compose logs -f api`
- **Re-run migrations only:** `docker compose run --rm api npm run db:migrate --workspace @roster/api`
- **Device health:** the Devices page flags a terminal offline when its last
  heartbeat exceeds `DEVICE_OFFLINE_THRESHOLD_SECONDS`.
- **Backups:** the Postgres volume is `roster_db_data`. Back it up with
  `docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB`.

## 8. Not included yet

- Reverse proxy / TLS termination (planned once hosting is chosen).
- Payroll, shift scheduling, non-MB20-VL devices, native mobile — out of v1 scope.
- Real-hardware validation pass (milestone 11) — pending physical device.
