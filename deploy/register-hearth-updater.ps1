# Registers the Hearth host updater (scripts\hearth-updater.ps1) as a Windows
# Task Scheduler task -- the Windows analogue of the systemd timer / cron line.
#
# The task runs the updater every minute (well within the app's 3-minute
# heartbeat window): it refreshes the heartbeat so the app shows managed updates
# as active, and applies any pending in-app update request. Task Scheduler's
# minimum repetition interval is 1 minute, so we use that rather than the ~30s
# of the systemd timer.
#
# Run from a normal PowerShell in your Hearth install dir (holds the compose file
# + .\data) -- no admin needed. Simplest form (compose file auto-detected from the
# running project):
#   .\deploy\register-hearth-updater.ps1
# Or double-click deploy\register-hearth-updater.cmd. Override detection with:
#   .\deploy\register-hearth-updater.ps1 -ComposeFile docker-compose.postgres.ghcr.yml
#
# Unregister with:
#   Unregister-ScheduledTask -TaskName Hearth-Updater -Confirm:$false

param(
  [string]$ProjectDir = (Get-Location).Path,
  [string]$ComposeFile = '',
  [string]$TaskName = 'Hearth-Updater'
)

$ErrorActionPreference = 'Stop'

$script = Join-Path $ProjectDir 'scripts\hearth-updater.ps1'
if (-not (Test-Path $script)) { throw "updater script not found at $script -- run this from your Hearth install dir" }
$launcher = Join-Path $ProjectDir 'scripts\hearth-updater-hidden.vbs'
if (-not (Test-Path $launcher)) { throw "hidden launcher not found at $launcher -- run this from your Hearth install dir" }

# Auto-detect the compose file from the running Hearth project so the common case
# needs no -ComposeFile. `docker compose ls` reports each project's config files;
# pick the ghcr variant that's actually running. Fall back to the PGlite default.
$knownCompose = @('docker-compose.ghcr.yml', 'docker-compose.postgres.ghcr.yml')
if (-not $ComposeFile) {
  try {
    foreach ($proj in (docker compose ls --format json 2>$null | ConvertFrom-Json)) {
      foreach ($cf in ($proj.ConfigFiles -split ',')) {
        $base = Split-Path $cf.Trim() -Leaf
        if ($knownCompose -contains $base) { $ComposeFile = $base; break }
      }
      if ($ComposeFile) { break }
    }
  } catch {}
  if ($ComposeFile) { Write-Output "Detected compose file: $ComposeFile" }
  else {
    $ComposeFile = 'docker-compose.ghcr.yml'
    Write-Output "No running Hearth project found; defaulting to $ComposeFile (pass -ComposeFile to override)."
  }
}

# Launch via wscript, not powershell.exe directly: a direct powershell action
# flashes a console window every tick. wscript has no console and starts the
# updater hidden (see hearth-updater-hidden.vbs), still in the logged-on user's
# session so Docker Desktop stays reachable. The launcher takes the project dir +
# compose file as args and sets them as env vars for the updater.
$action = New-ScheduledTaskAction `
  -Execute 'wscript.exe' `
  -Argument "`"$launcher`" `"$ProjectDir`" `"$ComposeFile`"" `
  -WorkingDirectory $ProjectDir

# One-time start (now), repeating every minute indefinitely. Omitting the
# repetition duration is what makes it indefinite -- do NOT set it to
# [TimeSpan]::MaxValue, which serializes to an out-of-range P99999999D duration
# that Register-ScheduledTask rejects. StartWhenAvailable re-arms it after the
# host is off/asleep. The task runs as the registering (logged-on) user, which is
# what lets `docker compose` reach the Docker Desktop engine.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

# Let a registration failure surface as an error -- don't fall through to the
# success message below.
Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Hearth managed updater -- applies in-app update requests (compose: $ComposeFile)" `
  -Force -ErrorAction Stop | Out-Null

Write-Output "Registered scheduled task '$TaskName' (every 1 min)."
Write-Output "  Project dir : $ProjectDir"
Write-Output "  Compose file: $ComposeFile"
Write-Output "  Script      : $script"
Write-Output ''
Write-Output "The app should show managed updates as active within ~1 minute."
Write-Output "Unregister with: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
