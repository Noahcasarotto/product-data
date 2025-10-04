# 🤖 LLM-Powered Conversation Analysis

Automatically analyze all customer conversations to extract pain points and feature suggestions.

## Quick Start

### 1. Install Dependencies

```bash
pip3 install pandas openpyxl openai python-dotenv
# Or for Anthropic Claude:
pip3 install pandas openpyxl anthropic python-dotenv
```

### 2. Set Your API Key

**Option A: OpenAI (Recommended - Fast & Cheap)**
```bash
export OPENAI_API_KEY="sk-proj-your-key-here"
```

**Option B: Anthropic Claude**
```bash
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
export USE_ANTHROPIC=true
```

### 3. Run Analysis

```bash
# Test with first 10 conversations
export TEST_MODE=true
python3 analyze_conversations.py

# Full analysis (all 770 conversations)
export TEST_MODE=false
python3 analyze_conversations.py
```

## 📊 What You Get

The analysis creates an Excel file: `HeyReach_Customer_Insights_TIMESTAMP.xlsx`

### Sheet 1: Customer Insights
Each row contains:
- **Contact info** (name, company, title, LinkedIn)
- **Conversation stats** (message count, reply count, dates)
- **LLM Analysis:**
  - Summary (one sentence overview)
  - Engagement level (high/medium/low)
  - Is qualified lead (yes/no)
  - **Pain Point 1-4** (with severity: high/medium/low)
  - **Feature 1-4** (with which pain point it addresses)

### Sheet 2: Summary
- Total conversations analyzed
- High engagement leads
- Qualified leads count
- Pain points identified
- Feature suggestions generated

### Sheet 3: All Pain Points
- Every pain point from all conversations
- Sorted by severity
- Linked to company and contact

### Sheet 4: Feature Frequency
- All suggested features ranked by frequency
- Shows how many customers want each feature
- **Use this to prioritize your roadmap!**

### Sheet 5: All Features
- Complete list of all feature suggestions
- Who suggested them
- What pain point they solve

## 💡 Example Output

### Pain Points Extracted:
1. "Manual configuration management across multiple cloud providers is time-consuming" (Severity: High)
2. "Difficult to detect configuration drift before it causes issues" (Severity: High)
3. "Security audit compliance takes too much manual effort" (Severity: Medium)
4. "No unified view across AWS, Azure, and GCP" (Severity: Medium)

### Feature Suggestions:
1. **Multi-cloud config dashboard** - Addresses: Pain point 4
2. **Automated drift detection** - Addresses: Pain point 2
3. **One-click compliance reports** - Addresses: Pain point 3
4. **AI-powered config fixes** - Addresses: Pain point 1

## ⚙️ Configuration

### Environment Variables

```bash
# Required (choose one)
OPENAI_API_KEY=sk-proj-xxx          # For OpenAI GPT-4
ANTHROPIC_API_KEY=sk-ant-xxx       # For Anthropic Claude

# Optional
USE_ANTHROPIC=true                 # Use Claude instead of GPT
TEST_MODE=true                     # Analyze only first 10 conversations
```

### Models Used

- **OpenAI:** `gpt-4o-mini` (fast, cheap, good quality)
- **Anthropic:** `claude-3-5-sonnet-20241022` (highest quality)

## 💰 Cost Estimate

### For 770 Conversations:

**OpenAI GPT-4o-mini:**
- ~500 tokens per conversation
- ~385,000 total tokens
- Cost: ~$0.08 for input + $0.23 for output = **~$0.31 total**

**Anthropic Claude 3.5 Sonnet:**
- ~500 tokens per conversation  
- ~385,000 total tokens
- Cost: ~$1.16 for input + $4.62 for output = **~$5.78 total**

**Recommendation:** Start with OpenAI GPT-4o-mini. It's 20x cheaper and works great for this task.

## 🎯 Use Cases

### 1. Product Roadmap Prioritization
- See which features are requested most frequently
- Understand which pain points are most severe
- Prioritize based on qualified lead requests

### 2. Sales Intelligence
- Identify high-engagement leads
- Understand prospect pain points before calls
- Personalize follow-ups based on insights

### 3. Customer Research
- Aggregate pain points across industries
- Find patterns in feature requests
- Build personas based on common needs

### 4. Competitive Analysis
- See what competitors are failing at
- Identify market gaps
- Find differentiation opportunities

## 📈 Advanced Usage

### Filter by Company Type

```python
import pandas as pd

df = pd.read_excel('HeyReach_Customer_Insights_TIMESTAMP.xlsx', sheet_name='Customer Insights')

# Only analyze enterprise customers
enterprise = df[df['company_name'].str.contains('Inc|Corp|Ltd', case=False)]

# Only high severity pain points
critical = df[df['pain_point_1_severity'] == 'high']

# Qualified leads only
qualified = df[df['is_qualified_lead'] == True]
```

### Re-analyze Specific Conversations

```python
# Edit analyze_conversations.py to filter specific LinkedIn URLs
# Or modify the load_conversations method to filter by criteria
```

## 🔧 Troubleshooting

### "No conversations found"
- Make sure you've run `npm run heyreach:backfill` first
- Check that `exports/attio/messages.csv` exists

### "API key error"
- Verify your API key is set: `echo $OPENAI_API_KEY`
- Make sure key starts with `sk-proj-` (OpenAI) or `sk-ant-` (Anthropic)

### "Analysis taking too long"
- Use TEST_MODE=true to test with 10 conversations first
- OpenAI is much faster than Anthropic
- Analysis of 770 conversations takes ~5-10 minutes

### "JSON parsing error"
- This happens occasionally with LLM responses
- The script will log the error and continue
- Check the raw_analysis column for details

## 🚀 Next Steps After Analysis

1. **Review qualified leads** - Follow up with high-engagement prospects
2. **Build feature roadmap** - Use feature frequency to prioritize
3. **Address top pain points** - Focus on high-severity issues
4. **Create targeted campaigns** - Group leads by pain point
5. **Product positioning** - Use insights for messaging

## 📝 Output Sample

```
Contact: John Smith @ TechCorp
Summary: Interested in multi-cloud management, concerned about config drift
Engagement: high
Qualified: Yes

Pain Points:
1. Managing AWS, Azure, GCP separately is inefficient (High)
2. Config drift causes production issues (High)
3. Compliance audits take 2 weeks manually (Medium)

Features:
1. Unified multi-cloud dashboard → Addresses pain 1
2. Real-time drift detection → Addresses pain 2  
3. Automated compliance reports → Addresses pain 3
4. AI-powered remediation → Addresses pain 1 & 2
```

## 💪 Pro Tips

1. **Start with test mode** - Verify output format before analyzing all 770
2. **Use OpenAI first** - Much cheaper, analyze results, then use Claude if needed
3. **Review raw_analysis column** - Contains full JSON for debugging
4. **Filter by engagement_level** - Focus on "high" first
5. **Group by pain_point** - Find common themes across customers

---

**This analysis will give you the insights you need to build exactly what your customers want!** 🎯

