# 🤖 Attio Automation Configuration Guide

## Prerequisites

Before creating automations, ensure these custom fields exist in Attio:

### People Object - Required Custom Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `linkedin_url` | Text/URL | LinkedIn profile URL |
| `company_name` | Text | Lead's company |
| `job_title` | Text | Lead's position |
| `heyreach_campaign` | Text | Campaign name from HeyReach |
| `engagement_stage` | Select | Options: new, contacted, engaged, stale, converted |
| `first_contacted_at` | DateTime | When first message was sent |
| `last_contacted_at` | DateTime | Most recent interaction |
| `last_reply_at` | DateTime | Last time lead responded |
| `messages_sent` | Number | Count of outbound messages |
| `messages_received` | Number | Count of inbound messages |
| `response_rate` | Number | Percentage (0-100) |
| `interest_score` | Number | 1-10 scale |
| `days_since_contact` | Number | Days since last interaction |
| `requires_followup` | Checkbox | Automation trigger |
| `is_hot_lead` | Checkbox | High priority flag |

---

## 🎯 Core Automations to Create

### 1. Auto Follow-Up for Non-Responders

**Name**: `Auto Follow-Up Non-Responders`

**Trigger**:
- Object: People
- When: Record matches filter
- Filter:
  - `requires_followup` = true
  - AND `days_since_contact` > 3
  - AND `messages_received` = 0

**Actions**:

1. **Send Email** (if email available):
   ```
   Subject: Quick follow-up on our LinkedIn conversation

   Hi {{first_name}},

   I wanted to follow up on my LinkedIn message from {{days_since_contact}} days ago
   about {{heyreach_campaign}}.

   I understand you're busy - would it be helpful if I sent over a brief overview
   of how we could help {{company_name}}?

   Best regards
   ```

2. **Create Task**:
   - Title: "Manual follow-up needed: {{full_name}}"
   - Due date: Today + 1 day
   - Priority: Normal
   - Assigned to: Sales team

3. **Update Field**:
   - `engagement_stage` = "needs_attention"

---

### 2. Hot Lead Alert

**Name**: `Hot Lead Notification`

**Trigger**:
- Object: People
- When: Field changes
- Field: `interest_score`
- Condition: New value >= 8

**Actions**:

1. **Send Slack Notification**:
   ```
   🔥 HOT LEAD ALERT!

   Name: {{full_name}}
   Company: {{company_name}}
   Interest Score: {{interest_score}}/10
   Last Reply: {{last_reply_at}}

   View in Attio: {{record_url}}
   ```

2. **Create High-Priority Task**:
   - Title: "🔥 Hot Lead: {{full_name}} - Immediate action"
   - Due date: Today
   - Priority: High
   - Description: Include engagement summary

3. **Add to List**:
   - List name: "Hot Leads - Immediate Action"

4. **Update Fields**:
   - `is_hot_lead` = true
   - `assigned_to` = Top sales rep

---

### 3. Lead Scoring Automation

**Name**: `Calculate Lead Score`

**Trigger**:
- Object: People
- When: Any of these fields change:
  - `messages_received`
  - `last_reply_at`
  - `engagement_stage`

**Actions**:

1. **Calculate Score** (using Attio formula field):
   ```javascript
   // Base score
   let score = 5;

   // Response factor
   if (messages_received > 0) score += 2;
   if (messages_received > 2) score += 1;

   // Speed factor
   if (response_time_hours < 24) score += 2;
   if (response_time_hours < 1) score += 1;

   // Engagement factor
   if (engagement_stage == "engaged") score += 2;

   // Limit to 1-10
   Math.min(10, Math.max(1, score))
   ```

2. **Update Field**:
   - `interest_score` = calculated value

3. **Conditional Actions**:
   - If score >= 8: Trigger Hot Lead Alert
   - If score <= 3: Mark as "cold_lead"

---

### 4. Re-engagement Campaign

**Name**: `Re-engage Cold Leads`

**Trigger**:
- Schedule: Daily at 9:00 AM
- Filter:
  - `days_since_contact` > 7
  - AND `engagement_stage` != "converted"
  - AND `engagement_stage` != "not_interested"

**Actions**:

1. **Send Re-engagement Email**:
   ```
   Subject: Should we close your file?

   Hi {{first_name}},

   I haven't heard back from you regarding {{heyreach_campaign}}.

   I'm going to assume you're either:
   1. Super busy (totally understand!)
   2. Not the right time
   3. Not interested

   If it's #1 or #2, just let me know when would be better.
   If it's #3, no worries at all - I'll close your file.

   Best regards
   ```

2. **Update Fields**:
   - `engagement_stage` = "re_engaging"
   - `last_contacted_at` = NOW()

3. **Create Task**:
   - Title: "Check re-engagement response: {{full_name}}"
   - Due date: Today + 3 days

---

### 5. Conversation Activity Logger

**Name**: `Log Conversation Activity`

**Trigger**:
- Object: People
- When: Note or Activity added

**Actions**:

1. **Update Fields**:
   - `last_contacted_at` = NOW()
   - `days_since_contact` = 0

2. **Check Content** (if possible):
   - If note contains "responded":
     - `messages_received` += 1
     - `has_responded` = true
     - `last_reply_at` = NOW()

---

### 6. Weekly Pipeline Review

**Name**: `Weekly Pipeline Summary`

**Trigger**:
- Schedule: Every Monday at 8:00 AM

**Actions**:

1. **Generate Report**:
   - Hot leads (interest_score >= 8)
   - Needs follow-up (requires_followup = true)
   - Stale conversations (days_since_contact > 14)
   - New responses (last_reply_at in last 7 days)

2. **Send Email to Team**:
   ```
   Subject: Weekly HeyReach Pipeline Summary

   This Week's Pipeline:
   - 🔥 Hot Leads: {{hot_lead_count}}
   - 📧 Need Follow-up: {{followup_count}}
   - 😴 Stale Conversations: {{stale_count}}
   - 💬 New Responses: {{response_count}}

   View full pipeline: {{attio_link}}
   ```

---

## 📊 Attio Views to Create

### 1. Hot Leads Board
**Filter**: `interest_score >= 8 OR is_hot_lead = true`
**Columns**: Name, Company, Interest Score, Last Reply, Days Since Contact
**Sort**: Interest Score (descending)

### 2. Needs Follow-Up
**Filter**: `requires_followup = true`
**Columns**: Name, Campaign, Days Since Contact, Engagement Stage
**Sort**: Days Since Contact (descending)

### 3. Active Conversations
**Filter**: `engagement_stage = "engaged" AND days_since_contact < 7`
**Columns**: Name, Messages Sent/Received, Last Reply
**Sort**: Last Reply (most recent first)

### 4. Response Analytics
**Group by**: Campaign Name
**Metrics**:
- Average Response Rate
- Average Interest Score
- Total Responses
- Conversion Rate

---

## 🚀 Implementation Steps

### Step 1: Create Custom Fields (10 minutes)
1. Go to Attio Settings → Objects → People
2. Add each custom field from the list above
3. Set appropriate field types and options

### Step 2: Run Initial Sync (5 minutes)
```bash
node sync-complete.js
```

### Step 3: Create Automations (20 minutes)
1. Go to Attio → Automations
2. Create each automation using the configurations above
3. Test with one record before enabling

### Step 4: Create Views (10 minutes)
1. Go to Attio → Views
2. Create each view with specified filters
3. Pin important views to sidebar

### Step 5: Test End-to-End (10 minutes)
1. Find a lead with `requires_followup = true`
2. Verify automation triggers
3. Check task creation and notifications
4. Confirm email sends (if configured)

---

## 🎯 Success Metrics

After 1 week, you should see:

- **Response Rate Increase**: 15-30% improvement from follow-ups
- **Hot Lead Identification**: 5-10% of leads flagged as hot
- **Faster Response Time**: Average response time to leads < 2 hours
- **Pipeline Visibility**: Complete view of all conversations in Attio

---

## 🔧 Troubleshooting

### Automation Not Triggering
- Check filter conditions match your data
- Verify custom fields exist and have values
- Ensure automation is activated (not paused)
- Test with manual trigger first

### Missing Data
- Run sync again: `node sync-complete.js`
- Check `.sync/sync_state.json` for last sync time
- Verify HeyReach API is returning data

### Email Not Sending
- Verify email integration in Attio
- Check email field has valid addresses
- Test with manual email first

---

## 📝 Maintenance

### Daily
- Monitor hot lead notifications
- Check follow-up task queue

### Weekly
- Review pipeline summary
- Adjust automation thresholds
- Clean up completed tasks

### Monthly
- Analyze automation performance
- Adjust interest score algorithm
- Archive converted/lost leads