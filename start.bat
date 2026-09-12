@echo off
setlocal EnableDelayedExpansion

:: ==============================================================
:: PM CONTROL TOWER — Startup Script (Windows Batch)
:: Usage:
::   start.bat              Production mode (after build)
::   start.bat dev          Development mode
::   start.bat seed         Seed database only
::   start.bat reset        Reset database and seed
:: ==============================================================

set "ROOT=%~dp0"
set "RUNNER=bun"
set "NEXT_PID="
set "RT_PID="

where bun >nul 2>&1 || (
    where npm >nul 2>&1 || (
        echo ERROR: Neither bun nor npm found in PATH.
        exit /b 1
    )
    set "RUNNER=npm run"
)

:: ---- .env ----
if not exist "%ROOT%.env" (
    echo [INFO] .env not found — copying from .env.example
    copy "%ROOT%.env.example" "%ROOT%.env" >nul
)

:: ---- Parse command ----
set "CMD=%~1"
if "%CMD%"=="" set "CMD=start"

if "%CMD%"=="seed" goto :seed_only
if "%CMD%"=="reset" goto :db_reset

:: ---- Install deps ----
echo.
echo [1/4] Installing dependencies...
cd /d "%ROOT%"
if "%RUNNER%"=="bun" (
    call bun install
) else (
    call npm install
)

:: ---- DB push ----
echo.
echo [2/4] Syncing database schema...
if "%RUNNER%"=="bun" (
    call bun run db:push
) else (
    call npx prisma db push --accept-data-loss
)

:: ---- DB seed ----
echo.
echo [3/4] Seeding database...
if "%RUNNER%"=="bun" (
    call bun run db:seed
) else (
    call npx tsx scripts/seed.ts
    call npx tsx scripts/seed-leadership.ts
)

goto :launch

:: ---- Seed only ----
:seed_only
echo.
echo [SEED] Seeding database...
cd /d "%ROOT%"
if "%RUNNER%"=="bun" (
    call bun run db:seed
) else (
    call npx tsx scripts/seed.ts
    call npx tsx scripts/seed-leadership.ts
)
echo Done.
goto :eof

:: ---- DB reset + seed ----
:db_reset
echo.
echo [RESET] Resetting database...
cd /d "%ROOT%"
if "%RUNNER%"=="bun" (
    call bun run db:reset
    call bun run db:push
    call bun run db:seed
) else (
    call npx prisma migrate reset --force
    call npx prisma db push --accept-data-loss
    call npx tsx scripts/seed.ts
    call npx tsx scripts/seed-leadership.ts
)
echo Database reset and seeded.
goto :eof

:: ---- Launch services ----
:launch
echo.
echo [4/4] Launching services...

if "%CMD%"=="dev" (
    :: Development mode
    echo   Next.js dev server on http://localhost:3000
    if "%RUNNER%"=="bun" (
        start "PMCT-App" cmd /c "cd /d "%ROOT%" && bun run dev"
    ) else (
        start "PMCT-App" cmd /c "cd /d "%ROOT%" && npm run dev"
    )

    echo   Realtime gateway on http://localhost:3003
    if "%RUNNER%"=="bun" (
        start "PMCT-Realtime" cmd /c "cd /d "%ROOT%" && bun mini-services/realtime/index.ts"
    ) else (
        start "PMCT-Realtime" cmd /c "cd /d "%ROOT%" && npx tsx mini-services/realtime/index.ts"
    )
) else (
    :: Production mode
    if not exist "%ROOT%.next\standalone\server.js" (
        echo   Build not found — running build first...
        if "%RUNNER%"=="bun" (
            call bun run build
        ) else (
            call npm run build
        )
    )

    set "NODE_ENV=production"
    set "PORT=3000"
    set "HOSTNAME=0.0.0.0"

    echo   Next.js production server on http://localhost:3000
    start "PMCT-App" cmd /c "cd /d "%ROOT%" && node .next\standalone\server.js"

    echo   Realtime gateway on http://localhost:3003
    set "REALTIME_PORT=3003"
    if "%RUNNER%"=="bun" (
        start "PMCT-Realtime" cmd /c "cd /d "%ROOT%" && bun mini-services/realtime/index.ts"
    ) else (
        start "PMCT-Realtime" cmd /c "cd /d "%ROOT%" && npx tsx mini-services/realtime/index.ts"
    )
)

echo.
echo ========================================
echo  PM Control Tower is running!
echo  App (local):   http://localhost:3000
echo  App (LAN):     http://YOUR-PC-IP:3000
echo  Realtime:      http://localhost:3003
echo  Close the terminal windows to stop.
echo ========================================
echo.

endlocal
