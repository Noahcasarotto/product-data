# HeyReach to Attio Sync Pipeline

Automated sync system that transfers all leads and conversations from HeyReach to Attio CRM.

## Quick Start

### 1. Test Sync (5 leads)
```bash
set AT_DRY_RUN=false
set MAX_LEADS=5
npm run heyreach:sync:delta
```

### 2. Full Sync (All leads)
```bash
set AT_DRY_RUN=false
set HR_FORCE_INBOX=1
set MAX_LEADS=10000
npm run heyreach:backfill
```

### 3. Auto-Sync (Every 30 mins)
```bash
node auto-sync-scheduler.js
```

## Features

✅ Syncs all HeyReach leads to Attio
✅ Prevents duplicates via LinkedIn URL matching
✅ Incremental updates for efficiency
✅ Full conversation history
✅ Automatic syncing every 30 minutes

## Documentation

- **[Complete Setup Guide](docs/SIMPLE_SETUP_GUIDE.md)** - Step-by-step instructions
- **[Automation Setup](docs/AUTOMATION_SETUP.md)** - Configure automatic syncing
- **[Verification Checklist](docs/PIPELINE_VERIFICATION_CHECKLIST.md)** - Ensure everything works

## Project Structure

```
├── heyreach-backfill.js     # Main sync script
├── auto-sync-scheduler.js   # Automatic sync scheduler
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── tests/                   # Test files
├── exports/                 # Data export directory
├── lib/                     # Shared libraries
└── .sync/                   # Sync state management
```

## Environment Variables

Create a `.env` file with:
```
# HeyReach API
HR_API_KEY=your_key_here
HR_LIST_IDS=345739
HR_GET_CONVERSATIONS_V2_URL=https://api.heyreach.io/api/public/inbox/GetConversationsV2

# Attio API
AT_API_KEY=your_key_here

# Settings
AT_DRY_RUN=false
MAX_LEADS=10000
```

## Support

Check logs in `sync-scheduler.log` and test with `node tests/test-complete-system.js`