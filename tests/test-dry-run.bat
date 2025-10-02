@echo off
echo ============================================
echo SAFE DRY-RUN TEST - NO DATA WILL BE CHANGED
echo ============================================
echo.

REM Step 1: Run safe connection test
echo [STEP 1] Testing API connections and field mapping...
node test-safe-sync.js
if %ERRORLEVEL% NEQ 0 (
    echo Test failed! Check test-results.json for details
    pause
    exit /b 1
)

echo.
echo [STEP 2] Running DRY-RUN mode with 1 lead...
echo This will show what WOULD happen without making changes
echo.

REM Force dry-run mode and test with 1 lead
set AT_DRY_RUN=true
set MAX_LEADS=1
set HR_PROBE_ONLY=false

npm run heyreach:backfill

echo.
echo ============================================
echo DRY-RUN COMPLETE - Check the output above
echo ============================================
echo.
echo Look for:
echo - "DRY RUN MODE" messages
echo - Field mappings being used
echo - What records would be created/updated
echo.
echo Next steps if everything looks good:
echo 1. Run with 1 real lead: test-single-lead.bat
echo 2. Check in Attio that the lead appears correctly
echo 3. Gradually increase: 10, 100, then full sync
echo.
pause