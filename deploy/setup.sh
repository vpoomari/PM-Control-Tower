#!/usr/bin/env bash
# ==============================================================
# PM CONTROL TOWER — Bare-metal setup script (Linux, Node 20+ / Bun)
# Installs dependencies, prepares .env with generated secrets, creates the
# database, loads the reference enterprise dataset and builds the app.
#
#   chmod +x deploy/*.sh && ./deploy/setup.sh
#   ./deploy/setup.sh --no-seed      # skip reference data (clean instance)
# ==============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SEED=1
[[ "${1:-}" == "--no-seed" ]] && SEED=0

echo "◈ PM CONTROL TOWER — setup in $ROOT"

# ---------- 1. Runtime ----------
if command -v bun >/dev/null 2>&1; then
  PKG="bun"
elif command -v node >/dev/null 2>&1 && [[ "$(node -v | cut -c2- | cut -d. -f1)" -ge 20 ]]; then
  PKG="npm"
else
  echo "✗ Node.js 20+ (or Bun 1.2+) is required." && exit 1
fi
echo "  • Package manager: $PKG ($(bun --version 2>/dev/null || node -v))"

# ---------- 2. Dependencies ----------
if [[ "$PKG" == "bun" ]]; then
  bun install --frozen-lockfile
else
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
fi

# ---------- 3. Environment ----------
if [[ ! -f .env ]]; then
  if command -v openssl >/dev/null 2>&1; then
    JWT="$(openssl rand -hex 32)"
    RT="$(openssl rand -hex 24)"
  else
    JWT="$(head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1)"
    RT="$(head -c 24 /dev/urandom | sha256sum | cut -d' ' -f1)"
  fi
  cat > .env <<EOF
DATABASE_URL=file:$ROOT/db/pmct.db
JWT_SECRET=$JWT
REALTIME_SECRET_KEY=$JWT
REALTIME_SECRET=$RT
REALTIME_URL=http://127.0.0.1:3003
REALTIME_PORT=3003
PORT=3000
HOSTNAME=127.0.0.1
EOF
  chmod 600 .env
  echo "  • .env created with generated secrets (JWT/REALTIME). Review before exposing publicly."
else
  echo "  • .env already exists — kept as-is."
fi
set -a; source .env; set +a

# ---------- 4. Database ----------
if [[ "$PKG" == "bun" ]]; then
  bunx prisma generate && bunx prisma db push
  if [[ "$SEED" == "1" ]]; then bun run db:seed; fi
else
  npx prisma generate && npx prisma db push
  if [[ "$SEED" == "1" ]]; then npm run db:seed:node; fi
fi

# ---------- 5. Build ----------
if [[ "$PKG" == "bun" ]]; then
  bun run build
else
  npm run build
fi
echo "  • Production build ready (.next/standalone)"

# ---------- 6. Realtime gateway (systemd hint) ----------
cat <<'EOF'

◈ Setup complete. Start the platform:

  Option A (recommended — two processes):
    Terminal 1:  npm run start            # app  → http://127.0.0.1:3000
    Terminal 2:  npm run realtime:node    # realtime gateway → 127.0.0.1:3003

  Option B (PM2):
    pm2 start deploy/ecosystem.config.js && pm2 save

  Then front both with deploy/nginx.conf (TLS via certbot).
  Default reference logins are listed in docs/08-REFERENCE-DATA-GUIDE.md
  — CHANGE ALL DEMO PASSWORDS before go-live (Admin → Users).
EOF
