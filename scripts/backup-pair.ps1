# PM CONTROL TOWER - Backup pair builder (with data + without data).
# Produces two timestamped archives in backups\:
#   pmct-full-backup-<stamp>.zip   WITH DATA: full source + consistent DB snapshot + .env + manifest
#   pmct-app-backup-<stamp>.zip    WITHOUT DATA: full source + .env.example only + manifest
#                                  (no db\*.db, no .env - safe to share off-box)
# Both archives carry docs\ (guides, training, deployment), README, CHANGELOG and
# a backup-manifest.json describing contents + restore steps.
#
# Source set matches the 2026-10-22 convention: everything except node_modules,
# build caches, logs, screenshots, downloads, tool scratch and backup folders.
#
# Usage:  powershell -File scripts\backup-pair.ps1 [-Stamp 20261023-153000]

param([string]$Stamp = (Get-Date -Format "yyyyMMdd-HHmmss"))

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $RepoRoot "deployment\scripts\common.ps1")   # Write-Step / Write-Ok / Compress-Zip

$version   = (Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json).version
$backupDir = Join-Path $RepoRoot "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$work = Join-Path $env:TEMP ("pmct-backup-pair-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $work | Out-Null

Write-Step "Backup pair v$version ($Stamp) starting"

# ---- 1. Stage the shared source set (excludes caches / scratch / backups) ----
$base = Join-Path $work "base"
New-Item -ItemType Directory -Force -Path $base | Out-Null
$exclDirs = @("node_modules", ".next", ".next-brand-check", ".next-brand-dev",
              ".zscripts", ".zwork", "backups", "_backups", "tool-results",
              "gui-test-screenshots", "download", ".git") | ForEach-Object { Join-Path $RepoRoot $_ }
robocopy $RepoRoot $base /E /XD $exclDirs /XF "*.log" "tsconfig.tsbuildinfo" /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
$srcCount = (Get-ChildItem $base -Recurse -File).Count
Write-Ok "Source staged: $srcCount files"

# ---- 2. Consistent database snapshot (online VACUUM INTO - safe while the app runs) ----
$snap = Join-Path $work "snapshot.db"
Push-Location $RepoRoot
try {
  npx --yes tsx scripts/vacuum-db-snapshot.ts $snap
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $snap)) { throw "database snapshot failed" }
} finally { Pop-Location }
Write-Ok ("DB snapshot: {0:N1} MB" -f ((Get-Item $snap).Length / 1MB))

# ---- 3. Data inventory (optional - powers the full manifest) ----
$inventory = $null
$invFile = Join-Path $RepoRoot ("scripts\.tmp-inventory-" + [guid]::NewGuid().ToString("N").Substring(0, 6) + ".ts")
try {
  @'
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const tables: { name: string }[] = await db.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name"
  );
  const out: Record<string, number> = {};
  for (const t of tables) {
    try {
      const r: { c: unknown }[] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "${t.name}"`);
      out[t.name] = Number(r[0]?.c ?? 0);
    } catch { /* skip views / virtual tables */ }
  }
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
'@ | Set-Content $invFile -Encoding UTF8
  Push-Location $RepoRoot
  try {
    $json = & npx --yes tsx $invFile 2>$null | Out-String
    if ($LASTEXITCODE -eq 0 -and $json.Trim()) { $inventory = $json.Trim() | ConvertFrom-Json }
  } finally { Pop-Location }
  if ($inventory) {
    $tblCount = @($inventory | Get-Member -MemberType NoteProperty).Count
    Write-Ok "Inventory: $tblCount tables"
  } else {
    Write-Warn2 "Inventory unavailable - manifest will omit dataInventory"
  }
} finally {
  if (Test-Path $invFile) { Remove-Item $invFile -Force -ErrorAction SilentlyContinue }
}

function New-Manifest([bool]$withData, [string]$kind, [string]$contents, [string]$restore) {
  $m = [ordered]@{
    created      = (Get-Date).ToString("o")
    app          = "PM Control Tower"
    version      = $version
    kind         = $kind
    dataIncluded = $withData
    contents     = $contents
    host         = $env:COMPUTERNAME
    restore      = $restore
  }
  if ($withData) {
    $m["database"] = "consistent snapshot via SQLite VACUUM INTO (db/custom.db)"
    if ($inventory) { $m["dataInventory"] = $inventory }
  }
  $m | ConvertTo-Json -Depth 5
}

# ---- 4. FULL backup (with data) ----
$full = Join-Path $work "full"
robocopy $base $full /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "stage copy failed ($LASTEXITCODE)" }
Copy-Item $snap (Join-Path $full "db\custom.db") -Force
Get-ChildItem (Join-Path $full "db") -Include "*.db-journal","*.db-wal","*.db-shm" -Recurse -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue
$fullRestore = "Extract, point .env DATABASE_URL at the extracted db/custom.db, run 'npm ci && npx prisma generate', then 'npm run dev'. All users and data are included."
New-Manifest $true "full-backup-with-data" `
  "complete application source + docs + config + runtime database + .env secrets" `
  $fullRestore |
  Set-Content (Join-Path $full "backup-manifest.json") -Encoding UTF8
$fullZip = Join-Path $backupDir ("pmct-full-backup-" + $Stamp + ".zip")
Compress-Zip -SourceDir $full -DestZip $fullZip -RootName "PM-Control-Tower"
Write-Ok ("Full backup (with data): {0} ({1:N1} MB)" -f (Split-Path $fullZip -Leaf), ((Get-Item $fullZip).Length / 1MB))

# ---- 5. APP backup (without data) ----
$app = Join-Path $work "app"
robocopy $base $app /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "stage copy failed ($LASTEXITCODE)" }
# strip everything data/secret, keep a placeholder so db/ exists after extract
Remove-Item (Join-Path $app "db") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $app ".env") -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $app "db") | Out-Null
@(
  "Runtime databases live in this folder (excluded from this backup by design).",
  "Set DATABASE_URL in .env to an absolute path inside it (e.g. file:C:/PM-Control-Tower/db/custom.db),",
  "then run: npx prisma generate, then npx prisma db push",
  "",
  "Optional demo data: see scripts/seed*.ts - npm run db:seed:node",
  "Full data backup: see the paired pmct-full-backup-*.zip"
) | Set-Content (Join-Path $app "db\README.md") -Encoding UTF8
$appRestore = "Extract, run 'npm ci', copy .env.example to .env and set DATABASE_URL, run 'npx prisma generate' then 'npx prisma db push', optionally 'npm run db:seed:node', then 'npm run dev'."
New-Manifest $false "app-backup-no-data" `
  "application source + docs + config only - NO database, NO .env secrets" `
  $appRestore |
  Set-Content (Join-Path $app "backup-manifest.json") -Encoding UTF8
$appZip = Join-Path $backupDir ("pmct-app-backup-" + $Stamp + ".zip")
Compress-Zip -SourceDir $app -DestZip $appZip -RootName "PM-Control-Tower"
Write-Ok ("App backup (without data): {0} ({1:N1} MB)" -f (Split-Path $appZip -Leaf), ((Get-Item $appZip).Length / 1MB))

# ---- 6. Verify both archives ----
function Test-Zip([string]$zip, [bool]$withData) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z = [System.IO.Compression.ZipFile]::OpenRead($zip)
  try {
    $names = @($z.Entries | ForEach-Object { $_.FullName })
    $bad = @()
    if ($withData) {
      if ($names -notcontains "PM-Control-Tower/db/custom.db") { $bad += "missing db/custom.db" }
      if ($names -notcontains "PM-Control-Tower/.env")        { $bad += "missing .env" }
    } else {
      if ($names -contains "PM-Control-Tower/db/custom.db")   { $bad += "db leaked" }
      if ($names -contains "PM-Control-Tower/.env")           { $bad += ".env leaked" }
      if ($names -notcontains "PM-Control-Tower/db/README.md"){ $bad += "missing db/README.md" }
    }
    foreach ($probe in @("PM-Control-Tower/backup-manifest.json", "PM-Control-Tower/docs/01-DEPLOYMENT-GUIDE.md",
                         "PM-Control-Tower/README.md", "PM-Control-Tower/package.json")) {
      if ($names -notcontains $probe) { $bad += "missing $probe" }
    }
    $leaks = @($names | Where-Object { $_ -match 'node_modules/|(^|/)\.next|\.log$|tsbuildinfo$' })
    if ($leaks.Count) { $bad += "junk entries: $($leaks.Count)" }
    [pscustomobject]@{ Zip = (Split-Path $zip -Leaf); Entries = $names.Count; Status = $(if ($bad) { "FAIL: " + ($bad -join "; ") } else { "OK" }) }
  } finally { $z.Dispose() }
}
Write-Step "Verifying archives..."
@(Test-Zip $fullZip $true; Test-Zip $appZip $false) | Format-Table -AutoSize | Out-String | Write-Host

# ---- 7. Checksums + cleanup ----
foreach ($z in @($fullZip, $appZip)) {
  Write-Ok ("SHA256  {0}  {1}" -f (Split-Path $z -Leaf), (Get-FileHash $z -Algorithm SHA256).Hash)
}
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
Write-Ok "Backup pair complete."
