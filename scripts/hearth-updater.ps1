# Hearth host updater (issue #81, Phase 2b) -- Windows / Docker Desktop.
#
# The Windows analogue of scripts/hearth-updater.sh. Runs on the HOST -- via a
# Task Scheduler trigger (see deploy/register-hearth-updater.ps1) -- NOT in a
# container. It is the only thing with Docker access; the Hearth app has none.
#
# Each tick it touches a heartbeat (so the app knows managed updates are live)
# and, if the app has written an update-request file, replaces the compose file
# with the target release's copy (keeping the old one as <file>.bak), pulls the
# new image and recreates the container, then writes a result file the app can
# read back. A compose.override.yml next to the compose file is applied too, so
# customise there or in .env -- never in the compose file itself.
#
# Config via env:
#   HEARTH_PROJECT_DIR   dir holding the compose file + .\data   (default: $PWD)
#   HEARTH_COMPOSE_FILE  compose file to drive   (default: docker-compose.ghcr.yml)
#   HEARTH_UPDATE_DIR    control-file dir   (default: <project>\data\updates)

# Like the bash script's `set -uo pipefail` (no `-e`): don't abort the run when a
# command fails. docker compose writes routine progress to stderr, and we want to
# reach Write-Result / request cleanup regardless -- failures are handled via
# $LASTEXITCODE below, not by terminating the script.
$ErrorActionPreference = 'Continue'

$projectDir = if ($env:HEARTH_PROJECT_DIR) { $env:HEARTH_PROJECT_DIR } else { (Get-Location).Path }
$composeFile = if ($env:HEARTH_COMPOSE_FILE) { $env:HEARTH_COMPOSE_FILE } else { 'docker-compose.ghcr.yml' }
$updateDir = if ($env:HEARTH_UPDATE_DIR) { $env:HEARTH_UPDATE_DIR } else { Join-Path $projectDir 'data\updates' }

$heartbeat = Join-Path $updateDir '.updater-heartbeat'
$request = Join-Path $updateDir 'update-request.json'
$result = Join-Path $updateDir 'update-result.json'

function Write-Log { param([string]$Message) Write-Output "[hearth-updater] $Message" }
function Now-Ms { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

New-Item -ItemType Directory -Force -Path $updateDir | Out-Null

# Liveness: the app treats a fresh heartbeat as "managed updates available".
if (Test-Path $heartbeat) { (Get-Item $heartbeat).LastWriteTime = Get-Date }
else { New-Item -ItemType File -Path $heartbeat | Out-Null }

# Nothing to do unless the app requested an update.
if (-not (Test-Path $request)) { exit 0 }

if (-not (Test-Path $projectDir)) { Write-Log "project dir $projectDir not found"; exit 1 }
Set-Location $projectDir

# Write {ok, version, at, error} atomically. Version is left null -- the app
# re-derives its own version from the new image when it restarts.
function Write-Result { # $Ok=bool  $ErrorMessage=string-or-empty
  param([bool]$Ok, [string]$ErrorMessage = '')
  $errJson = if ($ErrorMessage) { ConvertTo-Json $ErrorMessage } else { 'null' }
  $okJson = if ($Ok) { 'true' } else { 'false' }
  $body = '{"ok":' + $okJson + ',"version":null,"at":' + (Now-Ms) + ',"error":' + $errJson + "}`n"
  $tmp = "$result.tmp"
  # UTF-8 without BOM -- Node's JSON.parse (readUpdateResult) chokes on a BOM.
  [System.IO.File]::WriteAllText($tmp, $body, (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -Path $tmp -Destination $result -Force
}

$repo = 'chrislynch97/hearth'
$override = 'compose.override.yml'

function Compose-Args { param([string]$File)
  if (Test-Path $override) { @('-f', $File, '-f', $override) } else { @('-f', $File) }
}

# Swap in the release's compose file so a release that adds a service, volume or
# port needs no manual step. Best-effort: any failure keeps the current file and
# the update goes ahead with it.
function Update-ComposeFile {
  $tag = $null
  try { $tag = (Get-Content -Raw $request | ConvertFrom-Json).toVersion } catch {}
  # The tag ends up in a URL; accept only what a release tag looks like.
  if (-not ($tag -is [string] -and $tag -match '^v?[0-9]+(\.[0-9A-Za-z-]+)*$')) {
    Write-Log "no release tag in the request -- keeping $composeFile"
    return
  }
  $new = "$composeFile.new"
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -OutFile $new `
      -Uri "https://raw.githubusercontent.com/$repo/$tag/$composeFile"
  } catch {
    Write-Log "couldn't fetch $composeFile for $tag -- keeping the current one"
    Remove-Item -Path $new -Force -ErrorAction SilentlyContinue
    return
  }
  # Validated in place, so .env and relative paths resolve as they will for real.
  $compose = Compose-Args $new
  docker compose @compose config -q
  if ($LASTEXITCODE -ne 0) {
    Write-Log "$composeFile for $tag doesn't validate here -- keeping the current one"
    Remove-Item -Path $new -Force -ErrorAction SilentlyContinue
    return
  }
  if ((Get-FileHash $new).Hash -eq (Get-FileHash $composeFile).Hash) {
    Remove-Item -Path $new -Force
    return
  }
  Copy-Item -Path $composeFile -Destination "$composeFile.bak" -Force
  Move-Item -Path $new -Destination $composeFile -Force
  Write-Log "replaced $composeFile with the $tag copy (previous kept as $composeFile.bak)"
}

Update-ComposeFile

Write-Log "update requested -- pulling ($composeFile)"
$compose = Compose-Args $composeFile
docker compose @compose pull
if ($LASTEXITCODE -eq 0) { docker compose @compose up -d }
if ($LASTEXITCODE -eq 0) {
  Write-Log 'update applied'
  Write-Result $true
}
else {
  Write-Log 'update failed'
  Write-Result $false 'docker compose pull/up failed -- see the hearth-updater log'
}

# Clear the request last, so a crash mid-update leaves it to retry next tick.
Remove-Item -Path $request -Force -ErrorAction SilentlyContinue
