# HeyReach Conversation Extraction Tool

A complete solution for extracting **all conversations and customer data** from HeyReach, including historical messages and contact information.

## 🎯 What This Does

Successfully extracts:
- ✅ **All contacts** (2,672 people)
- ✅ **All conversations** (770 active threads)
- ✅ **Complete message history** (9,617 messages)
- ✅ **Engagement metrics** (reply rates, response times, conversation stages)

Exports to:
- 📊 **Excel** (.xlsx) - Multiple sheets with organized data
- 📄 **CSV** - For import into any CRM
- 🗄️ **SQLite** - Queryable database format

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Key

Create a `.env` file:

```bash
HR_API_KEY=your_heyreach_api_key_here
HR_GET_CONVERSATIONS_V2_URL=https://api.heyreach.io/api/public/inbox/GetConversationsV2
HR_FORCE_INBOX=1
MAX_LEADS=0
AT_DRY_RUN=false
OUTPUT_DIR=exports/attio
```

### 3. Extract All Conversations

```bash
npm run heyreach:backfill
```

This will create:
- `exports/attio/people.csv` - All contacts
- `exports/attio/messages.csv` - All messages
- `exports/attio/threads.csv` - Conversation threads
- `HeyReach_COMPLETE_ALL_DATA_[timestamp].xlsx` - Complete Excel export

## 📋 Key Features

### Main Extraction Script (`heyreach-backfill.js`)

- **Auto-discovers working API endpoints** (HeyReach's docs are broken)
- **Handles pagination** automatically across all campaigns
- **Prevents duplicates** via LinkedIn URL matching
- **Rate limiting** to avoid API throttling
- **Incremental updates** - tracks what's already synced
- **Multiple authentication methods** - tries all formats until one works

### Real-time Webhook Receiver (`webhook_receiver.py`)

Capture new conversations as they happen:

```bash
pip3 install flask pandas openpyxl requests
python3 webhook_receiver.py
```

Then configure HeyReach webhook to point to: `http://your-server:5000/webhook`

## 📊 Output Format

### Excel File Sheets

1. **All Contacts** - LinkedIn profiles, job titles, companies
2. **All Messages** - Complete conversation history
3. **Conversations** - Thread summaries with metrics
4. **Summary** - Quick statistics overview

### Engagement Metrics

Each conversation includes:
- Message counts (sent/received)
- Response rate
- Response time (hours)
- Conversation stage (new/contacted/engaged/stale)
- First/last contact dates

## 🛠️ Why This Exists

HeyReach's API documentation is **completely broken**:
- ❌ Standard REST endpoints return 404
- ❌ Leads API doesn't exist
- ❌ Documentation shows incorrect endpoints

This tool:
- ✅ Uses the **actual working inbox API** (`/api/public/inbox/GetConversationsV2`)
- ✅ Tests multiple authentication methods
- ✅ Works around their broken pagination
- ✅ Successfully extracts 99.5% of all data

## 📁 Project Structure

```
├── heyreach-backfill.js          # Main extraction script
├── webhook_receiver.py            # Real-time webhook capture
├── extract_all_leads.js          # Alternative leads extraction
├── check_all_campaigns.js        # Campaign discovery tool
├── exports/attio/                # Extracted data directory
├── docs/                         # Additional documentation
└── README.md                     # This file
```

## 🔧 Configuration Options

### Environment Variables

```bash
# Required
HR_API_KEY                        # Your HeyReach API key
HR_GET_CONVERSATIONS_V2_URL       # Inbox API endpoint

# Optional
MAX_LEADS=0                       # Limit extraction (0 = all)
HR_FORCE_INBOX=1                  # Force inbox mode
HR_MAX_INBOX_BATCHES=10000        # Max campaign batches
HR_INBOX_MAX_PAGES=10000          # Max pages per batch
HR_INBOX_CONCURRENCY=3            # Parallel requests
HR_INBOX_LIMIT=100                # Results per page
```

## 📈 Success Metrics

Extracted from production HeyReach account:
- **2,672 contacts** (100% of expected 2,671)
- **770 conversations with replies** (99.5% of expected 774)
- **9,617 total messages**
- **Complete conversation history**

## 🐛 Troubleshooting

### "API returns 404"
- ✅ This is normal! The script tests multiple endpoints automatically
- ✅ It will find the working inbox endpoint

### "Only got partial data"
- Check `HR_INBOX_MAX_PAGES` is set high enough
- Review `full_extraction_fixed.log` for errors

### "Authentication failed"
- Verify your API key from HeyReach Settings > Integrations > API
- Key should be: `kFE6gXz+...` format

## 📝 Usage Examples

### Extract to Excel only:

```bash
npm run heyreach:backfill
python3 -c "
import pandas as pd
people = pd.read_csv('exports/attio/people.csv')
messages = pd.read_csv('exports/attio/messages.csv')
threads = pd.read_csv('exports/attio/threads.csv')

with pd.ExcelWriter('output.xlsx') as writer:
    people.to_excel(writer, sheet_name='Contacts', index=False)
    messages.to_excel(writer, sheet_name='Messages', index=False)
    threads.to_excel(writer, sheet_name='Threads', index=False)
"
```

### Query with SQL:

```python
import sqlite3
import pandas as pd

# Load CSV to SQLite
conn = sqlite3.connect('heyreach.db')
pd.read_csv('exports/attio/messages.csv').to_sql('messages', conn, if_exists='replace')

# Query
df = pd.read_sql("""
    SELECT * FROM messages 
    WHERE direction = 'received'
    ORDER BY timestamp DESC 
    LIMIT 100
""", conn)
```

## 🙏 Credits

- **Mohamed** - Discovered the working HeyReach inbox API endpoint
- Built with: Node.js, Axios, Python, Pandas, Flask

## 📄 License

MIT License - Feel free to use and modify

---

**Note:** This tool was created because HeyReach's official API documentation is unreliable. Use at your own risk and always backup your data.
