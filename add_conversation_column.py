#!/usr/bin/env python3
"""
Add full conversation column to Customer Insights sheet
"""

import pandas as pd
from datetime import datetime

print("="*70)
print("Adding Full Conversation Column")
print("="*70)

# Load the analyzed insights file
INSIGHTS_FILE = 'outputs/excel_reports/HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx'
MESSAGES_FILE = 'outputs/raw_exports/exports/attio/messages.csv'

print(f"\n📥 Loading files...")
insights_df = pd.read_excel(INSIGHTS_FILE, sheet_name='Customer Insights')
messages_df = pd.read_csv(MESSAGES_FILE)

print(f"   ✅ Loaded {len(insights_df):,} analyzed conversations")
print(f"   ✅ Loaded {len(messages_df):,} messages")

# Build conversation strings for each person
print(f"\n🔄 Building conversation strings...")
conversation_strings = {}

for linkedin_url in insights_df['linkedin_url'].unique():
    if pd.isna(linkedin_url):
        continue
    
    # Get all messages for this person, sorted by time
    person_messages = messages_df[
        messages_df['person_match_linkedin_url'] == linkedin_url
    ].sort_values('timestamp')
    
    # Build single-line conversation string
    conversation_parts = []
    for _, msg in person_messages.iterrows():
        timestamp = msg['timestamp'][:19] if pd.notna(msg['timestamp']) else 'Unknown'
        sender = "YOU" if msg['direction'] == 'sent' else "LEAD"
        body = str(msg['body']).replace('\n', ' ').replace('\r', ' ') if pd.notna(msg['body']) else ''
        
        conversation_parts.append(f"[{timestamp}] {sender}: {body}")
    
    # Join all into one long string with space separator
    conversation_strings[linkedin_url] = " ".join(conversation_parts)

# Add conversation column to insights dataframe
print(f"   ✅ Built {len(conversation_strings):,} conversation strings")

insights_df['full_conversation'] = insights_df['linkedin_url'].map(conversation_strings)

print(f"\n💾 Saving updated file...")

# Save back to Excel
with pd.ExcelWriter(INSIGHTS_FILE, engine='openpyxl') as writer:
    # Write Customer Insights sheet with new column
    insights_df.to_excel(writer, sheet_name='Customer Insights', index=False)
    
    # Copy other sheets if they exist
    try:
        original_file = pd.ExcelFile(INSIGHTS_FILE)
        for sheet_name in original_file.sheet_names:
            if sheet_name != 'Customer Insights':
                df = pd.read_excel(original_file, sheet_name=sheet_name)
                df.to_excel(writer, sheet_name=sheet_name, index=False)
    except:
        pass

print(f"✅ Updated: {INSIGHTS_FILE}")
print(f"\n📊 New column 'full_conversation' added to Customer Insights sheet")
print(f"   - Contains complete conversation as single string")
print(f"   - Format: [timestamp] SENDER: message [timestamp] SENDER: message...")
print(f"   - Average length: {insights_df['full_conversation'].str.len().mean():.0f} characters")

print("\n" + "="*70)
print("✅ DONE! Open the file to see the new column")
print("="*70)

