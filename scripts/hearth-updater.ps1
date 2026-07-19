# Hearth host updater (issue #81, Phase 2b) -- Windows / Docker Desktop.
#
# The Windows analogue of scripts/hearth-updater.sh. Runs on the HOST -- via a
# Task Scheduler trigger (see deploy/register-hearth-updater.ps1) -- NOT in a
# container. It is the only thing with Docker access; the Hearth app has none.
#
# Each tick it touches a heartbeat (so the app knows managed updates are live)
# and, if the app has written an update-request file, pulls the new image and
# recreates the container, then writes a result file the app can read back.
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

Write-Log "update requested -- pulling ($composeFile)"
docker compose -f $composeFile pull
if ($LASTEXITCODE -eq 0) { docker compose -f $composeFile up -d }
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
