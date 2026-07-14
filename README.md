# Roster

Multi-tenant HR & attendance management for **ZKTeco MB20-VL** biometric
terminals. Runs identically via Docker Compose whether deployed on-prem (same
LAN as the device) or in the cloud (device reaches it over the internet).

## Dual sync mode

The device connects one of two ways, selected by `SYNC_MODE` in `.env`:

- **`push`** — the device calls our ADMS endpoints (`/iclock/*`). Used in the
  cloud, or on-prem when the device is pointed at us.
- **`poll`** — our backend connects to the device on TCP `4370` (ZK binary
  protocol) and pulls logs. Used on-prem when we can reach the device directly.

Both modes normalize to the same `NormalizedPunch` shape and land in the same
`attendance_events` table via a shared `SyncAdapter` interface
(`packages/shared/src/sync-adapter.ts`), so switching modes is a config change,
not a fork.

## Layout (npm workspaces monorepo)

```
roster/
  docker-compose.yml
  packages/
    shared/     # SyncAdapter interface + shared types
    api/        # Hono API, Drizzle schema + migrations (owns the DB)
    web/        # Next.js (App Router)
    simulator/  # Mock ADMS simulator (dev/test tool, kept long-term)
```

## Quick start

```bash
cp .env.example .env      # then edit secrets
docker compose up --build # api auto-migrates + seeds on first boot
```

- Web: http://localhost:3000 — login `admin@acme.test` / `admin123` (or `viewer@acme.test` / `viewer123`)
- API health: http://localhost:8080/health

Test the full pipeline without hardware:

```bash
npm run simulator                 # push a day of ADMS punches (push mode)
npm run simulator -- zk-server    # mock ZK device on :4370 (poll mode)
```

Then in the console: **Attendance → Re-resolve from events**.

See [docs/INSTALL.md](docs/INSTALL.md) for full deployment + second-customer onboarding.

## Features (v1)

- Staff directory with `device_user_id` mapping UI
- Dual-mode attendance sync (ADMS push listener + ZK poll worker) via a shared `SyncAdapter`
- Attendance resolution (events → `attendance_days`: first in / last out / hours / late flag)
- Daily/monthly attendance views + per-staff drill-down
- Leave requests + approval workflow
- Admin dashboard overview
- Device health monitoring (heartbeat / offline state)
- JWT auth with `admin` / `staff-viewer` roles

## Development (without Docker)

```bash
npm install
# Postgres on :5432, then point DATABASE_URL at it:
npm run db:migrate && npm run db:seed
npm run dev:api      # api on :8080  (tsx watch)
npm run dev:web      # web on :3000
```

## Status

Milestones 1–10 + 12 complete and verified end-to-end (push and poll paths,
auth/RBAC, resolution, UI, Docker Compose). **Milestone 11 (real-hardware
validation)** is pending a physical MB20-VL.
