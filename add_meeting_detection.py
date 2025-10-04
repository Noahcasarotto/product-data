#!/usr/bin/env python3
"""
Add meeting detection column and update qualified lead status
"""

import pandas as pd
import re

print("="*70)
print("Adding Meeting Detection Column")
print("="*70)

# Load the insights file
INSIGHTS_FILE = 'outputs/excel_reports/HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx'

print(f"\n📥 Loading file...")
insights_df = pd.read_excel(INSIGHTS_FILE, sheet_name='Customer Insights')
print(f"   ✅ Loaded {len(insights_df):,} conversations")

# Meeting booking keywords/phrases to detect
MEETING_KEYWORDS = [
    # Explicit booking
    r'\b(book|booked|booking)\s+(a\s+)?(meeting|call|demo|session)\b',
    r'\b(schedule|scheduled|scheduling)\s+(a\s+)?(meeting|call|demo|session)\b',
    r'\b(set up|setup|setting up)\s+(a\s+)?(meeting|call|demo|time)\b',
    
    # Calendar/time sharing
    r'\bcalendly\b',
    r'\bcal\.com\b',
    r'\b(my calendar|share.*(calendar|availability))\b',
    r'\b(send|sent).*(calendar|invite|meeting link)\b',
    
    # Acceptance phrases from lead
    r'LEAD:.*\b(yes.*meeting|happy to meet|would love to|sounds good.*call|let\'s do it)\b',
    r'LEAD:.*\b(i\'m available|i\'m free|works for me|that works)\b',
    r'LEAD:.*\b(send.*(invite|link|calendar)|book.*(time|slot))\b',
    
    # Time commitment
    r'\b(next (week|month|tuesday|wednesday|thursday|friday|monday).*call)\b',
    r'\b(15 min|30 min|half hour).*(call|chat|meeting)\b',
    
    # Meeting platforms
    r'\b(zoom|teams|meet|google meet)\s+(link|call|meeting)\b',
    
    # Strong interest
    r'LEAD:.*\b(interested.*demo|happy to chat|keen to learn more)\b',
]

def detect_meeting_booked(conversation_text):
    """Detect if a meeting was booked based on conversation text."""
    if pd.isna(conversation_text):
        return False
    
    text_lower = str(conversation_text).lower()
    
    # Check each pattern
    for pattern in MEETING_KEYWORDS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    
    return False

# Apply meeting detection
print(f"\n🔍 Detecting meeting bookings...")
insights_df['booked_meeting'] = insights_df['full_conversation'].apply(detect_meeting_booked)

meetings_booked = len(insights_df[insights_df['booked_meeting'] == True])
print(f"   ✅ Found {meetings_booked} conversations with meeting bookings")

# Update qualified lead status: anyone who booked a meeting is automatically qualified
print(f"\n⭐ Updating qualified lead status...")
original_qualified = len(insights_df[insights_df['is_qualified_lead'] == True])

# Set qualified_lead = TRUE for anyone with booked_meeting = TRUE
insights_df.loc[insights_df['booked_meeting'] == True, 'is_qualified_lead'] = True

new_qualified = len(insights_df[insights_df['is_qualified_lead'] == True])
newly_qualified = new_qualified - original_qualified

print(f"   Previously qualified: {original_qualified}")
print(f"   Now qualified: {new_qualified}")
print(f"   Newly qualified (booked meetings): {newly_qualified}")

# Save updated file
print(f"\n💾 Saving updated file...")

with pd.ExcelWriter(INSIGHTS_FILE, engine='openpyxl') as writer:
    # Write Customer Insights sheet with new columns
    insights_df.to_excel(writer, sheet_name='Customer Insights', index=False)
    
    # Copy other sheets
    try:
        original_file = pd.ExcelFile(INSIGHTS_FILE)
        for sheet_name in original_file.sheet_names:
            if sheet_name != 'Customer Insights':
                df = pd.read_excel(original_file, sheet_name=sheet_name)
                df.to_excel(writer, sheet_name=sheet_name, index=False)
    except Exception as e:
        print(f"   Note: {str(e)[:100]}")

print(f"✅ Updated: {INSIGHTS_FILE}")

# Show sample meetings found
print(f"\n📋 Sample conversations with meetings booked:")
meeting_sample = insights_df[insights_df['booked_meeting'] == True][
    ['full_name', 'company_name', 'engagement_level', 'booked_meeting', 'is_qualified_lead']
].head(10)

if len(meeting_sample) > 0:
    for idx, row in meeting_sample.iterrows():
        name = row['full_name'] if pd.notna(row['full_name']) else 'Unknown'
        company = row['company_name'] if pd.notna(row['company_name']) else 'Unknown'
        print(f"   ✅ {name} @ {company}")
else:
    print("   (No meetings detected - may need to refine detection keywords)")

print("\n" + "="*70)
print("✅ COMPLETE!")
print("="*70)
print(f"New columns added:")
print(f"  - 'booked_meeting' (TRUE/FALSE)")
print(f"  - 'is_qualified_lead' updated (anyone with meeting = qualified)")
print("="*70)
