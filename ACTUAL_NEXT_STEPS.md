# Actual Next Steps - Working Solution

## The Real Problem

The `linkedin` field is a **system attribute** (`is_system_attribute: true`), which means:
- ❌ You CANNOT enable uniqueness on it in Attio UI
- ❌ It's controlled by Attio, not customizable
- ❌ `matching_attribute=linkedin` won't work for deduplication

## The Solution: Use linkedin_url_6 Instead

The `linkedin_url_6` field is a **custom field** that you created, which means:
- ✅ You CAN enable uniqueness on it
- ✅ It's fully under your control
- ✅ Can be used for matching

---

## Step 1: Make linkedin_url_6 Unique

1. Open Attio → Settings → Objects & Records → People
2. Find **"LinkedIn URL"** field (api_slug: `linkedin_url_6`)
3. Click Edit field
4. Enable **"Unique values"** checkbox ✅
5. Save

---

## Step 2: Update Sync Script to Match by linkedin_url_6

Edit `.env` file:

```env
# CHANGE THIS LINE:
# AT_PEOPLE_MATCH_ATTRIBUTE=linkedin

# TO THIS:
AT_PEOPLE_MATCH_ATTRIBUTE=linkedin_url_6
```

---

## Step 3: Fix Direction Field (Still Required)

1. Settings → Objects & Records → linkedin_messages
2. Find **"Direction"** field
3. Edit field → Add options:
   - `Inbound`
   - `Outbound`
4. Save

---

## Step 4: Run Test Sync

```bash
# Test with 5 leads
set MAX_LEADS=5
npm run heyreach:backfill
```

### Expected Behavior
- ✅ Creates 5 people with linkedin_url_6 populated
- ✅ Re-running sync will UPDATE those 5 people (not create duplicates)
- ✅ Messages have direction set

---

## Step 5: Verify No Duplicates

```bash
# Run sync again with same 5 leads
npm run heyreach:backfill
```

Check Attio:
- Should still have exactly 5 people (not 10)
- Same record IDs as before

---

## Step 6: Full Sync

```bash
set MAX_LEADS=10000
npm run heyreach:backfill
```

---

## Why This Works

**linkedin field** (system):
- Type: `text`
- System attribute: YES
- Unique: NO (can't change)
- Stores: LinkedIn slug like "johndoe"

**linkedin_url_6 field** (custom):
- Type: `text`
- System attribute: NO
- Unique: YES (you can enable this!)
- Stores: Full URL like "https://www.linkedin.com/in/johndoe"

The sync script already populates BOTH fields:
```javascript
{
  linkedin: "johndoe",  // System field (can't make unique)
  linkedin_url_6: "https://www.linkedin.com/in/johndoe"  // Custom field (CAN make unique)
}
```

By matching on `linkedin_url_6` instead of `linkedin`, deduplication will work!

---

## Summary

1. ✅ Enable uniqueness on `linkedin_url_6` (custom field)
2. ✅ Change `.env`: `AT_PEOPLE_MATCH_ATTRIBUTE=linkedin_url_6`
3. ✅ Add Direction options (Inbound, Outbound)
4. ✅ Run test sync (5 leads)
5. ✅ Verify no duplicates
6. ✅ Run full sync

**This will actually work because linkedin_url_6 is NOT a system attribute.**
