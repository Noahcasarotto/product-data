@echo off
echo ============================================
echo TESTING WITH 1 REAL LEAD
echo ============================================
echo.
echo This will sync ONLY 1 lead to Attio as a test
echo.

REM Confirm with user
set /p confirm="Are you sure you want to sync 1 lead to Attio? (yes/no): "
if /i not "%confirm%"=="yes" (
    echo Test cancelled.
    pause
    exit /b 0
)

echo.
echo [STARTING] Syncing 1 lead to Attio...
echo.

REM Enable real mode but limit to 1 lead
set AT_DRY_RUN=false
set MAX_LEADS=1
set HR_PROBE_ONLY=false

REM Run the sync
npm run heyreach:backfill

echo.
echo ============================================
echo SINGLE LEAD TEST COMPLETE
echo ============================================
echo.
echo Please check in Attio:
echo 1. Go to People in Attio
echo 2. Search for the synced lead
echo 3. Verify these fields are populated:
echo    - Name
echo    - LinkedIn URL
echo    - Job Title
echo    - Company
echo    - HeyReach Lead ID
echo    - LinkedIn Messages (if any)
echo.
echo If everything looks good, you can proceed with:
echo - 10 leads: set MAX_LEADS=10 ^&^& npm run heyreach:backfill
echo - 100 leads: set MAX_LEADS=100 ^&^& npm run heyreach:backfill
echo - All leads: set MAX_LEADS=10000 ^&^& npm run heyreach:backfill
echo.
pause