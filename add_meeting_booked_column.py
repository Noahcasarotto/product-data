#!/usr/bin/env python3
"""
Add meeting_booked column using GPT-5 to detect if lead agreed to/booked a meeting
If meeting_booked = True, automatically set is_qualified_lead = True
"""

import pandas as pd
import json
import os
import time
from openai import OpenAI

print("="*70)
print("Adding Meeting Booked Column with GPT-5 Analysis")
print("="*70)

# Configuration
INSIGHTS_FILE = 'outputs/excel_reports/HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx'
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

if not OPENAI_API_KEY:
    print("❌ OPENAI_API_KEY not set")
    print("Set it with: export OPENAI_API_KEY=your_key")
    exit(1)

client = OpenAI(api_key=OPENAI_API_KEY)
model = "gpt-5"

print(f"\n📥 Loading file: {INSIGHTS_FILE}")
insights_df = pd.read_excel(INSIGHTS_FILE, sheet_name='Customer Insights')
print(f"   ✅ Loaded {len(insights_df):,} conversations")

# Analyze each conversation for meeting booking
print(f"\n🤖 Analyzing conversations with GPT-5 to detect meeting bookings...")
meeting_booked_results = []

for idx, row in insights_df.iterrows():
    conversation = row.get('full_conversation', '')
    
    if pd.isna(conversation) or conversation == '':
        meeting_booked_results.append(False)
        print(f"[{idx+1}/{len(insights_df)}] No conversation text - Skipping")
        continue
    
    # Create prompt for GPT-5
    prompt = f"""Analyze this LinkedIn conversation and determine if the LEAD agreed to book a meeting, scheduled a call, or said they want to meet.

**Conversation:**
{conversation}

**Your task:**
Determine if the LEAD (not YOU) explicitly:
- Agreed to schedule a meeting/call
- Said they would book time
- Confirmed availability for a meeting
- Said "yes" to a meeting request
- Provided times they're available
- Asked to schedule a call

Return ONLY a JSON object:
{{
    "meeting_booked": true or false,
    "evidence": "exact quote from lead showing they agreed to meet, or 'none' if no meeting"
}}

**Important:**
- Return TRUE only if the LEAD explicitly agreed or confirmed
- Return FALSE if they just showed interest but didn't commit to a meeting
- Return FALSE if only YOU asked for a meeting but they didn't respond yet
- Return FALSE if they said "maybe" or "let me think about it"
"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}]
        )
        
        result = response.choices[0].message.content
        analysis = json.loads(result)
        
        meeting_booked = analysis.get('meeting_booked', False)
        evidence = analysis.get('evidence', '')
        
        meeting_booked_results.append(meeting_booked)
        
        status = "✅ MEETING BOOKED" if meeting_booked else "❌ No meeting"
        print(f"[{idx+1}/{len(insights_df)}] {status}")
        if meeting_booked and evidence != 'none':
            print(f"   Evidence: {evidence[:100]}...")
        
        # Rate limiting
        time.sleep(2.0)
        
    except Exception as e:
        print(f"[{idx+1}/{len(insights_df)}] ⚠️ Error: {str(e)[:100]}")
        meeting_booked_results.append(False)
        time.sleep(2.0)

# Add meeting_booked column
insights_df['meeting_booked'] = meeting_booked_results

# Update is_qualified_lead: if meeting_booked = True, then is_qualified_lead = True
insights_df.loc[insights_df['meeting_booked'] == True, 'is_qualified_lead'] = True

meetings_booked = sum(meeting_booked_results)
print(f"\n✅ Analysis complete!")
print(f"   📅 Meetings booked: {meetings_booked}")
print(f"   ⭐ Total qualified leads (including meetings): {len(insights_df[insights_df['is_qualified_lead'] == True])}")

# Save updated file
print(f"\n💾 Saving updated file...")

with pd.ExcelWriter(INSIGHTS_FILE, engine='openpyxl') as writer:
    # Write updated Customer Insights sheet
    insights_df.to_excel(writer, sheet_name='Customer Insights', index=False)
    
    # Copy other sheets
    try:
        original_file = pd.ExcelFile(INSIGHTS_FILE)
        for sheet_name in original_file.sheet_names:
            if sheet_name != 'Customer Insights':
                df = pd.read_excel(original_file, sheet_name=sheet_name)
                df.to_excel(writer, sheet_name=sheet_name, index=False)
    except Exception as e:
        print(f"   ⚠️ Could not copy other sheets: {str(e)[:100]}")

print(f"✅ Saved: {INSIGHTS_FILE}")

print("\n" + "="*70)
print("RESULTS SUMMARY")
print("="*70)
print(f"📅 Meetings booked: {meetings_booked:,}")
print(f"⭐ Total qualified leads: {len(insights_df[insights_df['is_qualified_lead'] == True]):,}")
print(f"📊 Qualification rate: {len(insights_df[insights_df['is_qualified_lead'] == True]) / len(insights_df) * 100:.1f}%")
print(f"📅 Meeting booking rate: {meetings_booked / len(insights_df) * 100:.1f}%")
print("="*70)

