# Fresh Sync Configuration Guide

## Prerequisites ✅

- [x] Attio completely empty (0 people, 0 messages)
- [x] Backup created: `exports/attio_backup_2025-10-02T03-04-52/`
- [x] Sync state cleared
- [ ] **LinkedIn field uniqueness enabled** (DO THIS FIRST!)
- [ ] **Direction field options added** (DO THIS FIRST!)

---

## Step 1: Test Sync (5 Leads)

After fixing both Attio fields, test with a small batch first:

```bash
# Set test limits
set MAX_LEADS=5
set HR_INBOX_LIMIT=10
set AT_DRY_RUN=false

# Run test sync
npm run heyreach:backfill
```

### Expected Results
- ✅ 5 unique people created
- ✅ Messages linked to people
- ✅ Direction field populated (Inbound/Outbound)
- ✅ No duplicates

### Verification in Attio UI
1. Open Attio → People
2. Should see exactly 5 people
3. Click any person → Check "LinkedIn Messages" field
4. Click a message → Check "Direction" shows Inbound or Outbound
5. Run sync again → Should UPDATE existing people, not create new ones

---

## Step 2: Medium Sync (50 Leads)

If test passes, scale up:

```bash
# Update .env
set MAX_LEADS=50
set HR_INBOX_LIMIT=50
set CONCURRENCY=3

# Run sync
npm run heyreach:backfill
```

### Expected Time
- ~2-5 minutes for 50 leads

---

## Step 3: Full Sync (All Leads)

Once confident, sync everything:

### Option A: Recommended Settings
```bash
# Update .env
set MAX_LEADS=10000
set HR_INBOX_LIMIT=100
set CONCURRENCY=5
set HR_MAX_REQS_PER_2S=8

# Run full sync
npm run heyreach:backfill
```

### Option B: Conservative (Slower but Safer)
```bash
set MAX_LEADS=10000
set HR_INBOX_LIMIT=50
set CONCURRENCY=3
set HR_MAX_REQS_PER_2S=5

npm run heyreach:backfill
```

### Expected Time
- 100 leads: ~2 minutes
- 500 leads: ~10 minutes
- 1000+ leads: ~20-30 minutes

---

## Configuration Explained

### MAX_LEADS
- **What**: Maximum number of leads to process
- **Test**: `1-5`
- **Production**: `10000` or `0` (unlimited)

### HR_INBOX_LIMIT
- **What**: Messages fetched per HeyReach API call
- **Range**: `10-100`
- **Higher**: Faster but more API load

### CONCURRENCY
- **What**: Parallel requests to Attio
- **Range**: `1-5`
- **Higher**: Faster but more API pressure

### HR_MAX_REQS_PER_2S
- **What**: Rate limit (HeyReach allows <15/2s)
- **Safe**: `3-8`
- **Maximum**: `14` (not recommended)

### AT_DRY_RUN
- **Test mode**: `true` (no writes to Attio)
- **Live mode**: `false` (writes to Attio)

### AT_PEOPLE_MATCH_ATTRIBUTE
- **Value**: `linkedin`
- **Effect**: Matches people by LinkedIn slug to prevent duplicates
- **REQUIRES**: LinkedIn field to be unique in Attio

### HR_FORCE_INBOX
- **Value**: `1` (enabled)
- **Effect**: Syncs all messages, not just new ones
- **Use**: For initial full sync or re-sync

---

## Current .env Settings

```env
# CURRENT (Test mode - 1 lead)
MAX_LEADS=1
HR_INBOX_LIMIT=5
CONCURRENCY=1
HR_MAX_REQS_PER_2S=3

# RECOMMENDED FOR TEST (5 leads)
MAX_LEADS=5
HR_INBOX_LIMIT=10
CONCURRENCY=1
HR_MAX_REQS_PER_2S=3

# RECOMMENDED FOR PRODUCTION (All leads)
MAX_LEADS=10000
HR_INBOX_LIMIT=100
CONCURRENCY=5
HR_MAX_REQS_PER_2S=8
```

---

## Monitoring the Sync

### Console Output
Watch for:
- ✅ "Created person" messages
- ✅ "Created message" messages
- ✅ No duplicate warnings
- ⚠️ Any errors or failures

### Check Exports
Sync creates files in `exports/attio/`:
- `people.csv` - All synced people
- `messages.csv` - All synced messages
- `backfill-report.json` - Summary stats

### Check Sync State
File: `.sync/sync_state.json`
- Tracks synced threads
- Enables incremental updates
- Shows last sync timestamp

---

## Troubleshooting

### Problem: Duplicate People Created
**Cause**: LinkedIn field not unique in Attio
**Solution**: Stop sync, fix field, clear Attio, re-sync

### Problem: Direction Field Empty
**Cause**: Direction field has no options
**Solution**: Stop sync, add options, re-sync messages

### Problem: Slow Sync
**Options**:
- Increase `CONCURRENCY` (up to 5)
- Increase `HR_INBOX_LIMIT` (up to 100)
- Increase `HR_MAX_REQS_PER_2S` (up to 8)

### Problem: Rate Limit Errors
**Options**:
- Decrease `HR_MAX_REQS_PER_2S`
- Decrease `CONCURRENCY`
- The script has exponential backoff built-in

---

## After Successful Sync

### 1. Verify Data Quality
- Check 10 random people in Attio
- Verify names, LinkedIn URLs, job titles populated
- Check messages are linked to correct people
- Verify direction (Inbound/Outbound) is set

### 2. Set Up Incremental Sync
```bash
# Change to incremental mode
set HR_FORCE_INBOX=0

# Run regularly (every 30 min recommended)
npm run heyreach:backfill
```

### 3. Optional: Automate
Use Windows Task Scheduler to run sync every 30 minutes:
```bash
node C:\Users\Mohamed\Attio\heyreach-backfill.js
```

---

## Quick Commands

```bash
# Test sync (5 leads)
set MAX_LEADS=5 && npm run heyreach:backfill

# Production sync (all leads)
set MAX_LEADS=10000 && npm run heyreach:backfill

# Check current Attio counts
curl -s -X POST "https://api.attio.com/v2/objects/people/records/query" ^
  -H "Authorization: Bearer 7563d7e58437e25630f9b494eda3430285d95601c922ac3fd34d7586989b3d74" ^
  -H "Content-Type: application/json" -d "{\"limit\": 1}"

# Clear sync state (start fresh)
echo {"last_sync":null,"threads":{},"people":{}} > .sync\sync_state.json
```

---

**REMEMBER**: Fix the two Attio fields BEFORE running ANY sync!
