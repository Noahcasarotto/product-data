# 🎉 Mohamed's Solution - Extract ALL Conversations!

## Quick Start (3 steps)

### Step 1: Create .env file

Create a file named `.env` in this directory with:

```bash
# HeyReach API
HR_API_KEY=kFE6gXz+nVbfkseDsIqPju8EGEXV2/3p5Q/lctsCBsY=
HR_GET_CONVERSATIONS_V2_URL=https://api.heyreach.io/api/public/inbox/GetConversationsV2

# Settings
HR_FORCE_INBOX=1
MAX_LEADS=0
AT_DRY_RUN=false
OUTPUT_DIR=exports/attio

# Leave Attio fields empty if just exporting to CSV
AT_API_KEY=
AT_PEOPLE_UPSERT_URL=
```

### Step 2: Run the extraction

```bash
npm run heyreach:backfill
```

This will:
- ✅ Extract ALL historical conversations from HeyReach
- ✅ Export to CSV files (Excel-compatible)
- ✅ Take about 10-30 minutes depending on data size

### Step 3: Find your exported data

Your conversations will be saved in:
- `exports/attio/people.csv` - All contacts with LinkedIn profiles
- `exports/attio/messages.csv` - All messages
- `exports/attio/threads.csv` - Conversation threads with engagement metrics
- `exports/attio/backfill-report.json` - Summary report

## What Gets Extracted

✅ **Contact Information:**
- Full name (First + Last)
- Job title
- Company name
- LinkedIn URL
- Campaign info

✅ **All Messages:**
- Message content (body)
- Timestamp
- Direction (sent/received)
- Channel (InMail/DM)
- Conversation thread ID

✅ **Engagement Metrics:**
- Total messages sent/received
- Response rate
- Response time
- Conversation stage (new/engaged/stale)
- First/last contact dates

## How the API Works (Technical Details)

Mohamed discovered that HeyReach's API:

1. **Uses POST requests** to: `https://api.heyreach.io/api/public/inbox/GetConversationsV2`

2. **Requires this payload:**
```json
{
  "filters": {
    "campaignIds": [123],
    "linkedInAccountIds": [456]
  },
  "limit": 100,
  "offset": 0
}
```

3. **Authentication:** Bearer token in header
```
Authorization: Bearer YOUR_API_KEY
```

4. **Paginates through all conversations** automatically

## Advanced Options

### Extract specific campaigns only:

Edit `.env` and add:
```bash
HR_INBOX_CAMPAIGN_IDS=345739
```

### Limit to test with small dataset:

Edit `.env` and set:
```bash
MAX_LEADS=50
```

### Test without writing files (dry run):

```bash
AT_DRY_RUN=true npm run heyreach:backfill
```

## Converting CSV to Excel

The CSVs can be opened directly in Excel, Google Sheets, or processed with:

```python
import pandas as pd

# Read the CSVs
people = pd.read_csv('exports/attio/people.csv')
messages = pd.read_csv('exports/attio/messages.csv')
threads = pd.read_csv('exports/attio/threads.csv')

# Save to Excel with multiple sheets
with pd.ExcelWriter('heyreach_complete_export.xlsx') as writer:
    people.to_excel(writer, sheet_name='Contacts', index=False)
    messages.to_excel(writer, sheet_name='Messages', index=False)
    threads.to_excel(writer, sheet_name='Conversations', index=False)
```

## Troubleshooting

### "No conversations found"

Try forcing all campaigns:
```bash
# Remove campaign filter from .env
# Or set:
HR_INBOX_CAMPAIGN_IDS=
```

### "API Error 401"

- Check your API key is correct
- Try regenerating the API key in HeyReach

### "Rate limit exceeded"

The script has built-in rate limiting, but you can adjust:
```bash
HR_MAX_REQS_PER_2S=5  # Lower number = slower but safer
```

## Understanding the Output

### people.csv columns:
- `linkedin_url` - Unique identifier for matching
- `full_name`, `first_name`, `last_name`
- `job_title`, `company_name`
- `campaign_name`, `campaign_id`
- `heyreach_lead_id`

### messages.csv columns:
- `person_match_linkedin_url` - Links to people.csv
- `body` - Message text
- `timestamp` - When sent/received
- `direction` - sent/received
- `channel` - inmail/dm
- `thread_id` - Groups messages into conversations

### threads.csv columns:
- `person_match_linkedin_url` - Links to people.csv
- `thread_id` - Conversation ID
- `total_messages` - Count of messages
- `message_count_sent` / `message_count_received`
- `response_rate` - % replies
- `conversation_stage` - new/contacted/engaged/stale
- `messages_json` - Full JSON of all messages

## Next Steps

Once exported, you can:

1. **Import to Excel/Google Sheets** for analysis
2. **Import to a CRM** (HubSpot, Salesforce, etc.)
3. **Import to a database** (PostgreSQL, MySQL, etc.)
4. **Analyze with Python/R** for insights

## Why This Works When Other Methods Don't

Mohamed's discovery:
- ✅ Uses the correct endpoint (`/inbox/GetConversationsV2`)
- ✅ Uses POST not GET
- ✅ Includes proper authentication headers
- ✅ Handles pagination correctly
- ✅ Tries multiple auth header formats
- ✅ Has retry logic for rate limits

This is the ONLY working method for bulk historical extraction from HeyReach!

