# Outputs Directory

All generated files are organized here.

## 📊 excel_reports/

**Main files to use:**

1. **`HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx`** ⭐ **USE THIS**
   - Complete LLM analysis of all 770 conversations
   - Pain points and feature suggestions extracted
   - Qualified leads identified
   - Sheets: Customer Insights, Summary, All Pain Points, Feature Frequency, All Features

2. **`HeyReach_COMPLETE_ALL_DATA_20251002_144836.xlsx`**
   - Raw conversation data (all 2,672 contacts, 9,617 messages)
   - Sheets: All Contacts, All Messages, Conversations, Summary

## 📝 analysis_logs/

Detailed logs from each analysis run:
- `analysis_gpt5_FINAL_RUN.log` - Latest complete run with GPT-5
- `analysis_gpt5_clean.log` - Initial GPT-5 run (partial)
- Other logs from various attempts

## 📁 raw_exports/

CSV and JSON exports from HeyReach API:
- `exports/attio/people.csv` - All 2,672 contacts
- `exports/attio/messages.csv` - All 9,617 messages
- `exports/attio/threads.csv` - All conversation threads
- `exports/attio/backfill-report.json` - Extraction report

## 📜 scripts/

Python and JavaScript scripts:
- `analyze_conversations.py` - Main LLM analysis script
- `reanalyze_failed.py` - Re-analyze failed conversations
- `continue_analysis.py` - Continue from where left off
- `check_all_campaigns.js` - Discover HeyReach campaigns
- `extract_all_leads.js` - Extract all leads

## 📚 documentation/

All markdown documentation files:
- `README.md` - Main project documentation
- `ANALYSIS_GUIDE.md` - How to use the analysis system
- `EXTRACT_ALL_CONVERSATIONS.md` - HeyReach extraction guide
- Various other guides and status files

---

**Quick Access:**
- **Customer insights:** `excel_reports/HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx`
- **Raw data:** `raw_exports/exports/attio/*.csv`
- **Run analysis again:** `../analyze_conversations.py`




