# PowerShell script to create Windows Task Scheduler job for HeyReach sync
# Run this script as Administrator

$taskName = "HeyReach-Attio-Sync"
$taskPath = "\HeyReach\"
$scriptPath = "C:\Users\Mohamed\Attio\sync-heyreach.bat"

# Create task action
$action = New-ScheduledTaskAction -Execute $scriptPath

# Create trigger (every 6 hours, starting now)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::MaxValue)

# Create task settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Register the task
try {
    Register-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Action $action -Trigger $trigger -Settings $settings -Description "Syncs HeyReach data to Attio every 6 hours" -Force
    Write-Host "✅ Task Scheduler job created successfully!" -ForegroundColor Green
    Write-Host "Task Name: $taskPath$taskName" -ForegroundColor Cyan
    Write-Host "Schedule: Every 6 hours" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To manage the task:" -ForegroundColor Yellow
    Write-Host "  - Open Task Scheduler (taskschd.msc)"
    Write-Host "  - Navigate to Task Scheduler Library > HeyReach"
    Write-Host "  - Right-click the task to Run, Disable, or Delete"
} catch {
    Write-Host "❌ Failed to create task: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run this script as Administrator" -ForegroundColor Yellow
}