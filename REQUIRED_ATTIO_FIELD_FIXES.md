# Required Attio Field Configuration

**Status**: ✅ Attio is now completely empty (0 people, 0 messages)

Before running the fresh sync, you **MUST** fix these two field configurations in the Attio UI:

---

## Fix 1: Enable LinkedIn Field Uniqueness

### Problem
The `linkedin` field in the **People** object does NOT have uniqueness enabled.

### Current State (verified via API)
```json
{
  "api_slug": "linkedin",
  "is_unique": false  ❌ WRONG
}
```

### Why This Matters
- Without uniqueness, Attio's `matching_attribute=linkedin` parameter doesn't work
- Every sync creates NEW people instead of updating existing ones
- Results in massive duplicates

### How to Fix

1. Open Attio in your browser
2. Go to **Settings** (gear icon) → **Objects & Records**
3. Click on **People** object
4. Find the **LinkedIn** field (api_slug: `linkedin`)
5. Click **Edit field** (pencil icon)
6. Enable **"Unique values"** checkbox ✅
7. Click **Save**

### Verification
After fixing, the field should show:
```json
{
  "api_slug": "linkedin",
  "is_unique": true  ✅ CORRECT
}
```

---

## Fix 2: Add Direction Field Options

### Problem
The `direction` field in the **linkedin_messages** object has ZERO options defined.

### Current State (verified via API)
```json
{
  "api_slug": "direction",
  "type": "select",
  "config": { /* NO options */ }  ❌ WRONG
}
```

### Why This Matters
- Select fields need predefined options (like a dropdown)
- When sync tries to save `direction: "Outbound"`, Attio rejects it
- Direction values save as empty `[]`
- Cannot filter messages by direction in Attio

### How to Fix

1. Open Attio in your browser
2. Go to **Settings** (gear icon) → **Objects & Records**
3. Click on **linkedin_messages** object
4. Find the **Direction** field (api_slug: `direction`)
5. Click **Edit field** (pencil icon)
6. Add these two options:
   - **Option 1**: `Inbound`
   - **Option 2**: `Outbound`
7. Click **Save**

### Verification
After fixing, the field should have 2 options visible in the dropdown.

---

## ✅ After Fixing Both Fields

Once both fixes are complete, you're ready to run the fresh sync:

```bash
# Run full sync from HeyReach
npm run heyreach:backfill
```

The sync will now:
- ✅ Create unique people (no duplicates)
- ✅ Update existing people on re-sync (not create new ones)
- ✅ Save message directions correctly (Inbound/Outbound)
- ✅ Enable proper filtering and automation in Attio

---

## Current Attio State

**Verified via API on 2025-10-02:**
- ✅ People: 0
- ✅ Messages: 0
- ✅ Sync state: Cleared
- ⚠️ LinkedIn field: NOT unique (needs fix)
- ⚠️ Direction field: NO options (needs fix)

**Backup Available:**
- Location: `exports/attio_backup_2025-10-02T03-04-52/`
- People backed up: 11,987
- Messages backed up: 68

---

## Next Steps

1. **Fix the two fields** (instructions above)
2. **Run fresh sync**: `npm run heyreach:backfill`
3. **Verify in Attio UI**:
   - Check people have no duplicates
   - Check messages have directions set
   - Check message → person links work

---

**IMPORTANT**: Do NOT run any sync until BOTH field fixes are complete. Otherwise, you'll recreate the same duplicate problems.
