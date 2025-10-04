#!/usr/bin/env python3
"""
Create master_raw.xlsx with all unanalyzed HeyReach data
"""

import pandas as pd
from datetime import datetime

print("="*70)
print("Creating Master Raw Data File")
print("="*70)

# Load all raw CSV files
print("\n📥 Loading raw data...")
people_df = pd.read_csv('outputs/raw_exports/exports/attio/people.csv')
messages_df = pd.read_csv('outputs/raw_exports/exports/attio/messages.csv')
threads_df = pd.read_csv('outputs/raw_exports/exports/attio/threads.csv')

print(f"   ✅ Loaded {len(people_df):,} contacts")
print(f"   ✅ Loaded {len(messages_df):,} messages")
print(f"   ✅ Loaded {len(threads_df):,} conversation threads")

# Create master Excel file
output_file = 'outputs/excel_reports/master_raw.xlsx'
print(f"\n💾 Creating master raw file: {output_file}")

with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
    # Sheet 1: All Contacts (2,672)
    people_df.to_excel(writer, sheet_name='All Contacts', index=False)
    
    # Sheet 2: All Messages (9,617)  
    messages_df.to_excel(writer, sheet_name='All Messages', index=False)
    
    # Sheet 3: All Threads (conversation summaries)
    threads_df.to_excel(writer, sheet_name='All Threads', index=False)
    
    # Sheet 4: Summary Statistics
    summary_data = {
        'Metric': [
            'Total Contacts',
            'Total Messages',
            'Total Conversation Threads',
            'Messages Sent',
            'Messages Received',
            'Contacts with Replies',
            'Average Messages per Thread',
            'Extraction Date'
        ],
        'Value': [
            len(people_df),
            len(messages_df),
            len(threads_df),
            len(messages_df[messages_df['direction'] == 'sent']),
            len(messages_df[messages_df['direction'] == 'received']),
            len(threads_df[threads_df['message_count_received'] > 0]) if 'message_count_received' in threads_df.columns else 'N/A',
            round(len(messages_df) / len(threads_df), 1) if len(threads_df) > 0 else 0,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ]
    }
    summary_df = pd.DataFrame(summary_data)
    summary_df.to_excel(writer, sheet_name='Summary', index=False)
    
    # Auto-adjust column widths for main sheets
    for sheet_name in ['All Contacts', 'All Messages', 'All Threads']:
        worksheet = writer.sheets[sheet_name]
        df = people_df if sheet_name == 'All Contacts' else (messages_df if sheet_name == 'All Messages' else threads_df)
        
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            if idx < 26:  # Only first 26 columns (A-Z)
                column_letter = chr(65 + idx)
                worksheet.column_dimensions[column_letter].width = min(max_length + 2, 50)

print(f"✅ Created: {output_file}")
print(f"\n📊 File contents:")
print(f"   - Sheet 'All Contacts': {len(people_df):,} rows")
print(f"   - Sheet 'All Messages': {len(messages_df):,} rows")
print(f"   - Sheet 'All Threads': {len(threads_df):,} rows")
print(f"   - Sheet 'Summary': Statistics overview")
print("\n" + "="*70)
print("✅ Master raw data file ready!")
print("="*70)




