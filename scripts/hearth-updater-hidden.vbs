' Runs scripts\hearth-updater.ps1 with no visible window. Task Scheduler flashes
' a console window every tick if it launches powershell.exe directly; wscript has
' no console of its own and Run(..., 0, ...) starts PowerShell hidden. It still
' runs in the logged-on user's session, so Docker Desktop stays reachable.
' Args: 0 = project dir, 1 = compose file.
Set sh = CreateObject("WScript.Shell")
proj = WScript.Arguments(0)
compose = WScript.Arguments(1)
sh.Environment("Process").Item("HEARTH_PROJECT_DIR") = proj
sh.Environment("Process").Item("HEARTH_COMPOSE_FILE") = compose
cmd = "powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File """ & proj & "\scripts\hearth-updater.ps1"""
sh.Run cmd, 0, False
