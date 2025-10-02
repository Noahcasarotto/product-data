# PowerShell script to set up automatic HeyReach to Attio sync
# Run this as Administrator to create scheduled tasks

$scriptPath = "C:\Users\Mohamed\Attio"
$taskName = "HeyReach-Attio-Sync"

Write-Host "Setting up automatic HeyReach to Attio sync..." -ForegroundColor Green

# Create batch file for the sync
$batchContent = @"
@echo off
cd /d C:\Users\Mohamed\Attio
echo [%date% %time%] Starting HeyReach to Attio sync >> sync.log
call npm run heyreach:sync:delta >> sync.log 2>&1
echo [%date% %time%] Sync completed >> sync.log
"@

Set-Content -Path "$scriptPath\run-sync.bat" -Value $batchContent

# Create scheduled task to run every 30 minutes
$action = New-ScheduledTaskAction -Execute "$scriptPath\run-sync.bat" -WorkingDirectory $scriptPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register the scheduled task
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Syncs HeyReach leads to Attio CRM every 30 minutes" -Force
    Write-Host "✅ Scheduled task created successfully!" -ForegroundColor Green
    Write-Host "The sync will run every 30 minutes automatically." -ForegroundColor Yellow
} catch {
    Write-Host "❌ Failed to create scheduled task. Please run as Administrator." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Create a manual run script
$manualRunContent = @"
@echo off
echo Running manual HeyReach to Attio sync...
cd /d C:\Users\Mohamed\Attio
npm run heyreach:sync:delta
pause
"@

Set-Content -Path "$scriptPath\manual-sync.bat" -Value $manualRunContent

Write-Host "`nCreated helper scripts:" -ForegroundColor Cyan
Write-Host "  - run-sync.bat: Automated sync script (used by scheduler)" -ForegroundColor White
Write-Host "  - manual-sync.bat: Run sync manually anytime" -ForegroundColor White
Write-Host "  - sync.log: Log file for sync history" -ForegroundColor White

Write-Host "`nTo manage the scheduled task:" -ForegroundColor Yellow
Write-Host "  - Open Task Scheduler and look for '$taskName'" -ForegroundColor White
Write-Host "  - Or run: schtasks /query /tn $taskName" -ForegroundColor White
Write-Host "  - To disable: schtasks /change /tn $taskName /disable" -ForegroundColor White
Write-Host "  - To enable: schtasks /change /tn $taskName /enable" -ForegroundColor White