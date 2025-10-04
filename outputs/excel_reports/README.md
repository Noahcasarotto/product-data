# Excel Reports

## 📊 Main Files

### `master_raw.xlsx` ⭐ **RAW DATA**
**All unanalyzed HeyReach conversation data**

Sheets:
- **All Contacts** (2,672 rows) - Every person contacted
- **All Messages** (9,617 rows) - Complete message history
- **All Threads** (2,672 rows) - Conversation threads with metrics
- **Summary** - Statistics overview

**Use this for:** Raw data analysis, CRM import, custom queries


### `HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx` ⭐ **AI ANALYSIS**
**LLM-analyzed conversations with extracted insights**

Sheets:
- **Customer Insights** (770 rows) - Each conversation analyzed
  - Contact info
  - Conversation summary
  - Pain points (up to 4 per conversation)
  - Feature suggestions (4 per conversation)
  - Qualification status
  - Engagement level
- **Summary** - Analysis statistics
- **All Pain Points** - Every pain point extracted (153 total)
- **Feature Frequency** - Most requested features
- **All Features** - Complete feature list

**Use this for:** Product roadmap, sales prioritization, customer research


## 📁 Archived Reports

- `HeyReach_COMPLETE_ALL_DATA_20251002_144836.xlsx` - Initial extraction
- `HeyReach_Complete_Export_20251002_142919.xlsx` - Early export
- `HeyReach_Customer_Insights_20251002_153938.xlsx` - Test run (10 conversations)
- `HeyReach_Customer_Insights_20251002_191635.xlsx` - Partial analysis (461 conversations)

---

## Quick Start

**For raw data analysis:**
```
Open: master_raw.xlsx
Sheet: All Messages or All Contacts
```

**For product insights:**
```
Open: HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx
Sheet: Feature Frequency (see what customers want most)
Sheet: All Pain Points (see what problems they have)
Sheet: Customer Insights (individual conversation analysis)
```

**For sales:**
```
Open: HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx
Sheet: Customer Insights
Filter: is_qualified_lead = TRUE
Sort by: engagement_level = high
```
