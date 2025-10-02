@echo off
REM HeyReach to Attio Sync Script for Windows Task Scheduler
REM Schedule this to run every 6 hours for incremental sync

echo ===================================================
echo HeyReach to Attio Sync - %date% %time%
echo ===================================================

cd /d "C:\Users\Mohamed\Attio"

echo Running incremental sync...
call npm run heyreach:sync:delta

echo.
echo Sync completed at %date% %time%
echo ===================================================

REM Optionally log to file
REM echo %date% %time% - Sync completed >> sync-log.txt