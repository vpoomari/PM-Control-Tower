# 10 — Security Guide

## 1. Authentication

- **Credentials**: email + password; passwords hashed with **bcrypt** (cost 10).
  Never logged, never exported.
- **Session**: JWT (HS256, issuer `pm-control-tower`, **12 h expiry**) issued at
  login, returned in the JSON body and set as the `pmct_token` HTTP-only-style
  cookie. All API calls accept `Authorization: Bearer <token>` or the cookie.
- **Lockout**: repeated failures increment `failedLogins`; `lockedUntil` blocks
  further attempts. Unlock via Admin → Users or the reset CLI.
- **Socket authentication**: the realtime gateway verifies the **same JWT** before
  accepting a connection (`REALTIME_SECRET_KEY` must equal `JWT_SECRET`); sockets
  auto-join only their personal room (`user:<id>`), their roles' rooms
  (`role:<CODE>`), and the shared `global` broadcast.

## 2. Authorization

- **RBAC**: 32 permission codes × 8 roles (full matrix in `docs/07-RBAC-MATRIX.md`),
  enforced inside the API wrapper on **every** route; the UI only mirrors the
  server's decisions.
- **Wildcard & break-glass**: `PMO_ADMIN` role holds `*`; `User.isSuperAdmin`
  bypasses checks — restrict to the primary admin account.
- **Object-level scoping**: leadership reporting read requires `executive.view`;
  decision recording requires `gate.decide`; imports require the entity's manage
  permission — verified by automated negative checks (TEAM_MEMBER → 403).

## 3. Data protection

- **Secrets** live only in the environment (`JWT_SECRET`, `REALTIME_SECRET`,
  `DATABASE_URL`). `.env` is excluded from the package and from Docker build
  contexts; `setup.sh` creates it with `chmod 600`.
- **Database**: single SQLite file. Restrict file permissions (`chmod 640`,
  owned by the service user); include it in encrypted backups; Docker secrets stay
  out of images (runtime env only).
- **Audit trail**: every mutation, import/export and login writes an `AuditEvent`
  (actor, before/after JSON, IP, user-agent, severity) — append-only through the
  API. Integrate exports with your compliance archive.
- **CSV handling**: imports are parsed server-side with a bounded RFC4180 parser
  (2000-row cap, per-row validation inside a rolled-back transaction); exports are
  streaming with explicit row counts.

## 4. Transport & network

- Terminate TLS at your reverse proxy (certbot/Caddy) — see `deploy/nginx.conf`.
  HSTS recommended once TLS is stable.
- Expose **only** 80/443. The app (3000) and gateway (3003) bind to loopback/host-
  internal networks; the compose file exposes only the app port (and the optional
  Caddy edge).
- WebSocket path `/socket.io/` is JWT-authenticated at handshake; polling fallback
  uses the same auth.
- Rate limiting is built into the API wrapper (per-session sliding window); keep
  the reverse proxy's body-size limits as configured (25 MB default for imports).

## 5. Hardening checklist (production go-live)

- [ ] Unique `JWT_SECRET` / `REALTIME_SECRET` (`openssl rand -hex 32`), `.env` `chmod 600`
- [ ] **Every** reference/demo password changed or accounts deactivated (Admin → Users)
- [ ] TLS enforced; plain 3000 not reachable from untrusted networks
- [ ] Server firewall allows only 80/443 (and SSH from management range)
- [ ] Service runs as a non-root user (Docker image and PM2 unit both support this)
- [ ] `deploy/backup.sh` scheduled; backup directory encrypted/restricted; restore drill done
- [ ] Audit export integrated with retention policy
- [ ] Updates process defined (Deployment Guide § 7) with a staged environment
- [ ] Log shipping for app + gateway + proxy (90-day minimum retention)
- [ ] Break-glass: `isSuperAdmin` held by one account, password in your vault

## 6. Security-relevant behavior notes

- Session tokens expire after 12 h; there is no silent renewal — re-login is
  expected (suitable for internal enterprise use; add SSO at the proxy if desired).
- The AI assistant forwards prompts only to the configured AI connector and records
  usage metadata (tokens, duration, data scope) in `AIExecution`; disable the
  connector to turn the feature off.
- Webhook deliveries sign payloads (HMAC-SHA256) and log every attempt — review
  `deliveryCount`/`failureCount` for exfiltration signals.
- Error messages are human-readable but never leak stack traces or SQL to clients.

## 7. Reporting issues

Run security incidents through your internal process first (the audit trail and
backups in § 5 provide the evidence chain). When escalating to the maintainers,
redact secrets and personal data as you would for any production system.
