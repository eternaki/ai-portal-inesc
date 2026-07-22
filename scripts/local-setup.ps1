param(
  [switch]$ResetDb,
  [switch]$StartWeb,
  [switch]$StartAi,
  [switch]$SkipInstall,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'

function Info($Message) {
  Write-Host "[local-setup] $Message" -ForegroundColor Cyan
}

function Warn($Message) {
  Write-Host "[local-setup] $Message" -ForegroundColor Yellow
}

function Fail($Message) {
  Write-Host "[local-setup] $Message" -ForegroundColor Red
  exit 1
}

function Confirm-Step($Message) {
  if ($Yes) {
    return
  }

  $answer = Read-Host "$Message Type YES to continue"
  if ($answer -ne 'YES') {
    Fail 'Aborted.'
  }
}

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "Missing command: $Name"
  }
}

function Wait-Docker {
  Info 'Waiting for Docker daemon...'
  $deadline = (Get-Date).AddMinutes(3)
  do {
    cmd.exe /c "docker info >nul 2>nul"
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  Fail 'Docker daemon is not running. Start Docker Desktop and retry.'
}

function Wait-Db {
  Info 'Waiting for PostgreSQL healthcheck...'
  $deadline = (Get-Date).AddMinutes(3)
  do {
    $status = docker inspect --format='{{.State.Health.Status}}' ai-portal-inesc-db-1 2>$null
    if ($status -eq 'healthy') {
      return
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)

  Fail 'Database did not become healthy.'
}

function Invoke-DbScalar($Sql) {
  $output = docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -t -A -c $Sql
  if ($LASTEXITCODE -ne 0) {
    return $null
  }
  return ($output | Select-Object -Last 1).Trim()
}

function Invoke-DbCommand($Sql) {
  docker exec ai-portal-inesc-db-1 psql -U mlkd -d mlkd -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) {
    Fail "Database command failed: $Sql"
  }
}

function Get-TableCount($TableName) {
  $sql = "select case when to_regclass('public.$TableName') is null then 0 else (select count(*) from $TableName)::int end;"
  $value = Invoke-DbScalar $sql
  if ([string]::IsNullOrWhiteSpace($value)) {
    return 0
  }
  return [int]$value
}

function Restore-Seed {
  Info 'Restoring bundled seed into the local database...'
  docker exec ai-portal-inesc-db-1 bash -lc "psql -U mlkd -d mlkd -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP EXTENSION IF EXISTS vector CASCADE; CREATE EXTENSION vector WITH SCHEMA public;' && gzip -dc /docker-entrypoint-initdb.d/mlkd-seed.sql.gz | sed '/^SET transaction_timeout/d' | sed '/^CREATE EXTENSION IF NOT EXISTS vector/d' | psql -U mlkd -d mlkd -v ON_ERROR_STOP=1"
  if ($LASTEXITCODE -ne 0) {
    Fail 'Seed restore failed.'
  }
}

function Run-WebCommand($Arguments) {
  Push-Location $WebDir
  try {
    $env:DATABASE_URL = $DatabaseUrl
    npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) {
      Fail "npm $($Arguments -join ' ') failed."
    }
  } finally {
    Pop-Location
  }
}

function Start-BackgroundWeb {
  Info 'Starting web dev server in a background PowerShell window...'
  $logPath = Join-Path $WebDir '.next-dev.log'
  $command = @"
Set-Location '$WebDir'
`$env:DATABASE_URL='$DatabaseUrl'
`$env:AI_SERVICE_URL='http://localhost:8000'
npm.cmd run dev *> '$logPath'
"@
  Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $command) -WindowStyle Hidden
}

function Wait-Http($Url, $Name) {
  Info "Waiting for $Name at $Url..."
  $deadline = (Get-Date).AddMinutes(2)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {
      Start-Sleep -Seconds 3
    }
  } while ((Get-Date) -lt $deadline)

  Warn "$Name did not respond yet."
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$WebDir = Join-Path $RepoRoot 'web'
$DatabaseUrl = 'postgresql://mlkd:mlkd@localhost:5432/mlkd'

Set-Location $RepoRoot
Info "Repository: $RepoRoot"
Require-Command docker
Require-Command npm.cmd

Wait-Docker

if ($ResetDb) {
  Confirm-Step 'This will delete the local Docker database volume.'
  Info 'Resetting local database volume...'
  docker compose down -v
  if ($LASTEXITCODE -ne 0) {
    Fail 'docker compose down -v failed.'
  }
}

Info 'Starting PostgreSQL/pgvector container...'
docker compose up -d db
if ($LASTEXITCODE -ne 0) {
  Fail 'docker compose up -d db failed.'
}
Wait-Db

if (-not $SkipInstall) {
  Info 'Installing web dependencies if needed...'
  Run-WebCommand @('install')
}

Info 'Running Payload migrations...'
Run-WebCommand @('run', 'payload', '--', 'migrate')

$members = Get-TableCount 'members'
$publications = Get-TableCount 'publications'
$embeddings = Get-TableCount 'publication_embeddings'

Info "Current data: members=$members publications=$publications publication_embeddings=$embeddings"

if ([int]$publications -eq 0 -or [int]$embeddings -eq 0) {
  Warn 'The local database is missing seeded publications/embeddings.'
  Confirm-Step 'Restore the bundled seed into this local database?'
  Restore-Seed
  Info 'Re-running migrations after seed restore...'
  Run-WebCommand @('run', 'payload', '--', 'migrate')
}

Info 'Importing curated member data into local database...'
Push-Location $WebDir
try {
  $env:DATABASE_URL = $DatabaseUrl
  node scripts/import-members-db.mjs --apply
  if ($LASTEXITCODE -ne 0) {
    Fail 'Member DB import failed.'
  }
  node scripts/import-members-db.mjs --apply --data=data/mlkd-members-roster-update.json --report=reports/members-roster-import-db-apply.json
  if ($LASTEXITCODE -ne 0) {
    Fail 'Member roster DB import failed.'
  }
  Info 'Linking publication authors to member profiles...'
  node scripts/link-publication-members-db.mjs --apply
  if ($LASTEXITCODE -ne 0) {
    Fail 'Publication/member link backfill failed.'
  }
} finally {
  Pop-Location
}

$members = Get-TableCount 'members'
$publications = Get-TableCount 'publications'
$embeddings = Get-TableCount 'publication_embeddings'
$users = Get-TableCount 'users'

Info "Final data: members=$members publications=$publications publication_embeddings=$embeddings users=$users"

if ([int]$members -lt 59) {
  Warn 'Expected at least 59 members. Check web/reports/members-import-db-apply.json.'
}
if ([int]$publications -lt 252) {
  Warn 'Expected 252 seeded publications. Check the seed restore output.'
}
if ([int]$embeddings -lt 252) {
  Warn 'Expected 252 publication embeddings. Check the seed restore output.'
}

if ($StartAi) {
  Info 'Starting AI service container...'
  docker compose up -d ai
  if ($LASTEXITCODE -ne 0) {
    Fail 'docker compose up -d ai failed.'
  }
  Wait-Http 'http://localhost:8000/docs' 'AI docs'
}

if ($StartWeb) {
  Start-BackgroundWeb
  Wait-Http 'http://localhost:3000' 'web'
  Wait-Http 'http://localhost:3000/people' 'people page'
}

Write-Host ''
Info 'Local setup complete.'
Write-Host 'URLs:'
Write-Host '  Site:  http://localhost:3000'
Write-Host '  Admin: http://localhost:3000/admin'
Write-Host '  AI:    http://localhost:8000/docs'
Write-Host ''
Write-Host 'Useful commands:'
Write-Host '  scripts\local-setup.bat                  # setup DB + data'
Write-Host '  scripts\local-setup.bat --start-web      # setup and start web'
Write-Host '  scripts\local-setup.bat --start-ai       # setup and start AI'
Write-Host '  scripts\local-setup.bat --reset-db       # recreate local DB volume'
