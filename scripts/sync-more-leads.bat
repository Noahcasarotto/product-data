@echo off
echo ============================================
echo SYNCING MORE LEADS FROM HEYREACH
echo ============================================
echo.

REM Clear the sync state to force getting all leads
echo Temporarily clearing sync state to get more leads...
move .sync\sync_state.json .sync\sync_state_backup.json

REM Force getting more leads with higher limits
set AT_DRY_RUN=false
set MAX_LEADS=50
set HR_PAGE_LIMIT=50
set HR_INBOX_LIMIT=50
set HR_MAX_INBOX_BATCHES=3
set HR_FORCE_INBOX=1
set CONCURRENCY=3

echo.
echo Syncing up to 50 leads from HeyReach...
echo.

npm run heyreach:backfill

echo.
echo ============================================
echo SYNC COMPLETE - CHECK ATTIO
echo ============================================
echo.
echo Restoring sync state...
move .sync\sync_state_backup.json .sync\sync_state.json

echo.
echo Please check Attio for NEW leads that weren't there before.
echo The sync should have added more than the original 5.
echo.
pause