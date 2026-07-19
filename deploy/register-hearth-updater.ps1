# Registers the Hearth host updater (scripts\hearth-updater.ps1) as a Windows
# Task Scheduler task -- the Windows analogue of the systemd timer / cron line.
#
# The task runs the updater every minute (well within the app's 3-minute
# heartbeat window): it refreshes the heartbeat so the app shows managed updates
# as active, and applies any pending in-app update request. Task Scheduler's
# minimum repetition interval is 1 minute, so we use that rather than the ~30s
# of the systemd timer.
#
# Run from an elevated PowerShell in your Hearth install dir (holds the compose
# file + .\data), e.g.:
#   .\deploy\register-hearth-updater.ps1
#   .\deploy\register-hearth-updater.ps1 -ComposeFile docker-compose.postgres.ghcr.yml
#
# Unregister with:
#   Unregister-ScheduledTask -TaskName Hearth-Updater -Confirm:$false

param(
  [string]$ProjectDir = (Get-Location).Path,
  [string]$ComposeFile = 'docker-compose.ghcr.yml',
  [string]$TaskName = 'Hearth-Updater'
)

$ErrorActionPreference = 'Stop'

$script = Join-Path $ProjectDir 'scripts\hearth-updater.ps1'
if (-not (Test-Path $script)) { throw "updater script not found at $script -- run this from your Hearth install dir" }

# Pass config to the updater via inline env vars so the task is self-contained --
# no machine-wide environment pollution.
$command = "& { `$env:HEARTH_PROJECT_DIR='$ProjectDir'; `$env:HEARTH_COMPOSE_FILE='$ComposeFile'; & '$script' }"
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NonInteractive -NoProfile -ExecutionPolicy Bypass -Command `"$command`"" `
  -WorkingDirectory $ProjectDir

# Fire at logon, then repeat every minute forever. AtStartup instead of AtLogOn
# would need SYSTEM/service credentials that can reach the Docker Desktop engine;
# a logged-on user in the docker-users group is the simplest working setup.
$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration ([TimeSpan]::MaxValue)).Repetition

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Hearth managed updater -- applies in-app update requests (compose: $ComposeFile)" `
  -Force | Out-Null

Write-Output "Registered scheduled task '$TaskName' (every 1 min)."
Write-Output "  Project dir : $ProjectDir"
Write-Output "  Compose file: $ComposeFile"
Write-Output "  Script      : $script"
Write-Output ''
Write-Output "The app should show managed updates as active within ~1 minute."
Write-Output "Unregister with: Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
