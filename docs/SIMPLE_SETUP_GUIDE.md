# 🚀 Complete HeyReach to Attio Sync Guide
## For Beginners - Step by Step

---

## 📌 What This System Does

This system automatically:
1. **Pulls ALL your leads** from HeyReach (past, present, and future)
2. **Syncs them to Attio CRM** with all their information
3. **Keeps everything updated** automatically every 30 minutes
4. **Prevents duplicates** by matching LinkedIn profiles

### What Gets Synced:
✅ **Lead Information**
- Full Name (First + Last)
- LinkedIn Profile URL
- Job Title
- Company Name
- Location

✅ **Conversation Data**
- Last message content
- Last message date
- Whether they responded
- Campaign name
- List name
- Tags

✅ **Metadata**
- When they connected
- Message count
- Campaign info
- HeyReach conversation URL

---

## 🎯 Step 1: Test Everything First

Let's make sure everything is working before we sync thousands of leads.

### A. Test with Dry Run (No actual changes)
```bash
# This will show what WOULD happen without making changes
set AT_DRY_RUN=true
set MAX_LEADS=5
npm run heyreach:sync:delta
```

**What to look for:**
- ✅ "Connected to HeyReach successfully"
- ✅ "Connected to Attio successfully"
- ✅ Shows lead data being processed
- ✅ Says "DRY RUN - Would create/update..."

### B. Test with Real Data (5 leads only)
```bash
# This will actually sync 5 leads
set AT_DRY_RUN=false
set MAX_LEADS=5
npm run heyreach:sync:delta
```

**Check in Attio:**
1. Go to app.attio.com
2. Click on "People"
3. You should see 5 new people with "HeyReach" as source

---

## 🔄 Step 2: Initial Full Sync (All Past Leads)

Now let's sync ALL your existing leads from HeyReach.

### A. Prepare for Full Sync
```bash
# Set environment for full sync
set AT_DRY_RUN=false
set HR_FORCE_INBOX=1
set MAX_LEADS=10000
```

### B. Run Full Backfill
```bash
npm run heyreach:backfill
```

**This will:**
- Take about 30-45 minutes for 8000+ leads
- Show progress every 10 leads
- Create a report in `exports/attio/backfill-report.json`
- Save state for incremental updates

**Monitor Progress:**
You'll see messages like:
```
✅ Processing batch 1/80...
   Added: John Smith (LinkedIn: /in/johnsmith)
   Updated: Jane Doe (existing record)
📊 Progress: 100/8000 leads processed
```

---

## ⚙️ Step 3: Set Up Automatic Syncing

Choose ONE of these methods to keep everything synced automatically:

### Option A: Simple Background Runner (EASIEST)

**1. Create the auto-sync file:**
Create a new file `start-auto-sync.bat`:
```batch
@echo off
echo Starting HeyReach-Attio Auto Sync...
node auto-sync-scheduler.js
```

**2. Start it:**
```bash
# Double-click start-auto-sync.bat
# OR run in terminal:
start-auto-sync.bat
```

**What it does:**
- Runs every 30 minutes
- Syncs only NEW or UPDATED leads
- Logs everything to `sync-scheduler.log`
- Keeps running until you close it

### Option B: Windows Task Scheduler (Runs in Background)

**1. Run this PowerShell command as Administrator:**
```powershell
powershell -ExecutionPolicy Bypass -File setup-automatic-sync.ps1
```

**What it does:**
- Creates a Windows scheduled task
- Runs even when you're logged out
- Starts automatically on computer startup
- No terminal window needed

### Option C: PM2 Process Manager (Most Professional)

**1. Install PM2:**
```bash
npm install -g pm2
```

**2. Start the sync:**
```bash
pm2 start auto-sync-scheduler.js --name heyreach-sync
pm2 save
pm2 startup
```

**3. Monitor:**
```bash
pm2 status          # See if it's running
pm2 logs heyreach-sync  # View logs
pm2 stop heyreach-sync  # Stop it
```

---

## 📊 Step 4: Verify Everything is Working

### Check Sync Status:
```bash
# See last sync details
type .sync\sync_state.json

# Check logs
type sync-scheduler.log

# See sync report
type exports\attio\backfill-report.json
```

### In Attio:
1. Go to app.attio.com
2. Click "People"
3. Filter by Source = "HeyReach"
4. You should see all your leads!

---

## 🔧 Step 5: Customize Attio Fields (Optional but Recommended)

### Add Custom Fields in Attio:

1. **Go to Attio Settings** → Objects → People → Attributes

2. **Add these custom fields:**

| Field Name | Type | Purpose |
|------------|------|---------|
| HeyReach Campaign | Text | Campaign name from HeyReach |
| HeyReach List | Text | List name from HeyReach |
| HeyReach Last Message | Long Text | Last message content |
| HeyReach Last Message Date | DateTime | When last message was sent |
| HeyReach Responded | Checkbox | Did they respond? |
| HeyReach Tags | Tags | Tags from HeyReach |
| HeyReach Conversation URL | URL | Link to conversation in HeyReach |
| HeyReach Notes | Long Text | Any notes from HeyReach |

3. **Update the sync script** to use these fields (I can help with this)

---

## 🚦 Step 6: Set Up Attio Automations

Now that all your leads are in Attio, you can create automations!

### Example Automations:

**1. Follow-up for Non-Responders:**
- **Trigger:** HeyReach Responded = False AND Created > 7 days ago
- **Action:** Create task "Follow up with lead"

**2. Hot Lead Alert:**
- **Trigger:** HeyReach Last Message contains "interested" OR "demo" OR "meeting"
- **Action:** Send Slack notification, Create high-priority task

**3. Campaign Performance:**
- **Trigger:** New person with HeyReach Campaign field
- **Action:** Update campaign dashboard, Calculate response rates

### How to Create Automations in Attio:

1. Go to **Automations** in Attio
2. Click **Create Automation**
3. Choose a trigger (e.g., "Record matches filter")
4. Set conditions (e.g., "Source = HeyReach AND Responded = False")
5. Add actions (e.g., "Create task", "Send email", "Update field")

---

## 📈 Understanding the Sync Process

### What Happens During Each Sync:

1. **Checks HeyReach** for new conversations
2. **Extracts lead data** including all fields
3. **Looks up in Attio** by LinkedIn URL (prevents duplicates)
4. **Creates or Updates** the person record
5. **Saves sync state** for next run
6. **Generates report** of what was synced

### Sync Frequency:
- **Automatic:** Every 30 minutes
- **Manual:** Anytime using `npm run heyreach:sync:delta`
- **Full Re-sync:** Use `npm run heyreach:sync:full`

---

## 🛠️ Troubleshooting

### Issue: "API Error 401"
**Solution:** Check your API keys in `.env` file

### Issue: "No leads found"
**Solution:**
```bash
set HR_FORCE_INBOX=1
npm run heyreach:sync:full
```

### Issue: "Duplicates in Attio"
**Solution:** The system uses LinkedIn URLs to match. Make sure LinkedIn URL field is set up in Attio.

### Issue: "Sync stopped working"
**Check:**
```bash
# View logs
type sync-scheduler.log

# Test connection
node test-complete-system.js

# Reset and retry
del .sync\sync_state.json
npm run heyreach:sync:full
```

---

## 📋 Daily Operations Checklist

### Every Morning:
1. Check sync status: `pm2 status` or check Task Scheduler
2. Review new leads in Attio (Filter: Created = Today)
3. Check for any failed syncs in logs

### Weekly:
1. Review sync performance report
2. Check for any unmapped fields
3. Update automation rules as needed

### Monthly:
1. Full re-sync to catch any missed data: `npm run heyreach:sync:full`
2. Clean up old logs
3. Review and optimize automations

---

## 💡 Pro Tips

1. **Start Small:** Test with 5-10 leads first
2. **Monitor Initially:** Watch the first few automatic syncs
3. **Use Dry Run:** Always test with `AT_DRY_RUN=true` first
4. **Check Duplicates:** Ensure LinkedIn URL field is properly set
5. **Keep Logs:** They help troubleshoot issues

---

## 🎯 Next Steps After Setup

1. ✅ **Verify all leads are in Attio**
2. ✅ **Set up your first automation** (start simple)
3. ✅ **Create segments** (Responded vs Non-responded)
4. ✅ **Build dashboards** for campaign performance
5. ✅ **Train team** on using Attio data

---

## 📞 Getting Help

If something doesn't work:

1. **Check the logs:** `type sync-scheduler.log`
2. **Run test:** `node test-complete-system.js`
3. **Check API status:** Both HeyReach and Attio APIs
4. **Review this guide:** Most issues are covered here

---

## 🎉 Success Checklist

You're done when:
- [ ] All HeyReach leads appear in Attio
- [ ] Automatic sync runs every 30 minutes
- [ ] No duplicate records
- [ ] Automations are triggering
- [ ] Team can access lead data in Attio

---

**Remember:** This system is designed to be self-healing. If something fails, it will retry. The sync state is preserved, so you never lose progress!