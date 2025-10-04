# Attio Full Reset & Optimization Plan

## 📊 Current State
- **Attio People**: 500+ records
- **Attio Messages**: 68 records
- **HeyReach List 345739**: 0 active conversations (data likely already in Attio via native integration)

## 🎯 Goal
Clean slate with optimized bulk sync from HeyReach API

---

## 📋 EXECUTION PLAN

### **Phase 1: BACKUP (10 min)**

```bash
node attio-full-reset.js
```

**What it does**:
1. Fetches ALL people from Attio (paginated)
2. Fetches ALL LinkedIn messages from Attio
3. Saves to `exports/attio_backup_TIMESTAMP/`
   - `people_backup.json`
   - `messages_backup.json`
   - `cleanup_report.json`
4. Asks for 5-second confirmation
5. Deletes all messages (to avoid orphaned references)
6. Deletes all people
7. Verifies deletion
8. Generates cleanup report

**Output**: Full backup + clean Attio

---

### **Phase 2: IMPLEMENT BULK OPTIMIZATION (45 min)**

#### **2.1 Bulk Fetch & Index (20 min)**
Modify `heyreach-backfill.js`:

```javascript
// At script start - fetch ALL Attio people once
async function buildAttioIndex() {
  console.log('📥 Building Attio index...');
  const allPeople = [];
  let offset = 0;

  while (true) {
    const resp = await axiosClient.post(
      `${AT_API_BASE}/v2/objects/people/records/query`,
      { limit: 100, offset },
      { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
    );

    const batch = resp.data?.data || [];
    allPeople.push(...batch);
    console.log(`   Fetched ${allPeople.length} people...`);

    if (batch.length < 100) break;
    offset += 100;
  }

  // Build index by LinkedIn URL (both custom and system fields)
  const index = new Map();
  for (const person of allPeople) {
    const linkedinUrl = person.values.linkedin_url_6?.[0]?.value;
    const linkedinSlug = person.values.linkedin?.[0]?.value;

    if (linkedinUrl) {
      index.set(linkedinUrl, person);
    }
    if (linkedinSlug) {
      const fullUrl = `https://www.linkedin.com/in/${linkedinSlug}`;
      index.set(fullUrl, person);
    }
  }

  console.log(`   ✅ Indexed ${index.size} unique LinkedIn URLs`);
  return index;
}
```

#### **2.2 Parallel Processing (15 min)**

```javascript
// Replace sequential loop with parallel batches
const BATCH_SIZE = 5;

async function upsertPeopleBatch(peopleRows, attioIndex) {
  const batches = [];
  for (let i = 0; i < peopleRows.length; i += BATCH_SIZE) {
    batches.push(peopleRows.slice(i, i + BATCH_SIZE));
  }

  let totalOk = 0;
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(row => upsertOnePerson(row, attioIndex))
    );
    totalOk += results.filter(r => r.success).length;
    console.log(`   Processed ${totalOk}/${peopleRows.length}...`);
  }

  return { upserted: totalOk };
}
```

#### **2.3 Increase Concurrency (5 min)**

Update `.env`:
```
CONCURRENCY=5
HR_MAX_INBOX_BATCHES=10
HR_INBOX_LIMIT=100
MAX_LEADS=10000
```

#### **2.4 Remove HR_FORCE_INBOX limit (5 min)**

Allow full sync of all HeyReach data without artificial limits.

---

### **Phase 3: RUN FULL SYNC (1-3 hours)**

```bash
# Remove limits
set MAX_LEADS=10000 && set HR_INBOX_LIMIT=100

# Run optimized sync
node heyreach-backfill.js
```

**Expected performance**:
- 100 people: ~10 seconds (was ~2 minutes)
- 500 people: ~30 seconds (was ~10 minutes)
- 1000 people: ~1 minute (was ~20 minutes)
- 5000 people: ~5 minutes (was ~100 minutes)

**Progress tracking**:
- Real-time console output
- CSV exports updated continuously
- Watermark saved for incremental syncs

---

### **Phase 4: VERIFY (15 min)**

```bash
# Check final counts
node -e "
const axios = require('axios');
const key = '${ATTIO_API_KEY}';

(async () => {
  const people = await axios.post(
    'https://api.attio.com/v2/objects/people/records/query',
    { limit: 1 },
    { headers: { Authorization: \`Bearer \${key}\` } }
  );

  const messages = await axios.post(
    'https://api.attio.com/v2/objects/linkedin_messages/records/query',
    { limit: 1 },
    { headers: { Authorization: \`Bearer \${key}\` } }
  );

  console.log('People:', people.data.data.length);
  console.log('Messages:', messages.data.data.length);
})();
"
```

**Manual verification in Attio UI**:
1. Go to People → Check sample records have:
   - ✅ Job titles populated
   - ✅ LinkedIn URLs populated
   - ✅ Messages linked
2. Go to LinkedIn Messages → Check:
   - ✅ Bidirectional person links
   - ✅ Message bodies present
   - ✅ Directions (Inbound/Outbound)

---

## ⏱️ TOTAL TIME ESTIMATE

| Phase | Time | Description |
|-------|------|-------------|
| **Phase 1: Backup** | 10 min | Export all current data |
| **Phase 2: Optimization** | 45 min | Implement bulk fetch + parallel processing |
| **Phase 3: Full Sync** | 1-3 hours | Re-sync all HeyReach data |
| **Phase 4: Verify** | 15 min | Validate data integrity |
| **TOTAL** | **2-4 hours** | End-to-end clean slate |

---

## 🔄 ROLLBACK PLAN

If something goes wrong:

1. **Restore from backup**:
   ```bash
   # Script to restore from backup (TODO: create if needed)
   node restore-from-backup.js exports/attio_backup_TIMESTAMP
   ```

2. **Re-enable HeyReach native integration**:
   - Go to Attio settings → Integrations → Re-enable HeyReach

---

## ✅ SUCCESS CRITERIA

- [ ] All people from HeyReach synced to Attio
- [ ] All messages synced with bidirectional links
- [ ] No duplicates
- [ ] Job titles and companies populated
- [ ] LinkedIn URLs populated (for future syncs)
- [ ] Sync completes in <5 minutes for incremental updates

---

## 🚀 NEXT STEPS

1. **Review this plan** - Make sure you're comfortable with the approach
2. **Run Phase 1** - Backup everything (safe, reversible)
3. **Run Phase 2** - Implement optimizations (code changes)
4. **Run Phase 3** - Full sync (the big one)
5. **Run Phase 4** - Verify everything works

**Ready to proceed?**
