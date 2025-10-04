#!/usr/bin/env python3
"""
Re-analyze conversations that failed or have no data
"""

import pandas as pd
import json
import os
import time
from analyze_conversations import ConversationAnalyzer

def main():
    print("="*70)
    print("Re-analyzing Failed Conversations with GPT-5 mini")
    print("="*70)
    
    MESSAGES_CSV = "exports/attio/messages.csv"
    PEOPLE_CSV = "exports/attio/people.csv"
    EXISTING_RESULTS = "HeyReach_Customer_Insights_20251002_191635.xlsx"
    
    # Load existing results
    print(f"\n📥 Loading previous results...")
    existing_df = pd.read_excel(EXISTING_RESULTS, sheet_name='Customer Insights')
    
    # Find conversations that failed or are empty
    failed_urls = []
    success_urls = []
    
    for idx, row in existing_df.iterrows():
        url = row['linkedin_url']
        raw = row.get('raw_analysis', '{}')
        
        if pd.isna(raw) or raw == '{}' or raw == '':
            failed_urls.append(url)
        else:
            try:
                analysis = json.loads(raw)
                if 'error' in analysis or (not analysis.get('pain_points') and not analysis.get('summary')):
                    failed_urls.append(url)
                else:
                    success_urls.append(url)
            except:
                failed_urls.append(url)
    
    print(f"   ✅ Successfully analyzed: {len(success_urls)}")
    print(f"   ❌ Need to re-analyze: {len(failed_urls)}")
    
    if len(failed_urls) == 0:
        print("\n✅ All conversations already have valid analysis!")
        return
    
    # Load all conversations
    analyzer = ConversationAnalyzer(use_anthropic=False)
    all_conversations = analyzer.load_conversations(MESSAGES_CSV, PEOPLE_CSV)
    
    # Filter to only failed conversations
    failed_conversations = {
        url: data for url, data in all_conversations.items()
        if url in failed_urls
    }
    
    print(f"\n🤖 Re-analyzing {len(failed_conversations)} conversations with GPT-5 mini...")
    new_results_df = analyzer.analyze_all_conversations(failed_conversations)
    
    # Combine: keep successful ones, replace failed ones with new results
    print(f"\n📊 Merging results...")
    
    # Remove failed rows from existing
    existing_success_df = existing_df[existing_df['linkedin_url'].isin(success_urls)]
    
    # Combine with new results
    combined_df = pd.concat([existing_success_df, new_results_df], ignore_index=True)
    combined_df = combined_df.sort_values('total_messages', ascending=False).reset_index(drop=True)
    
    # Export
    output_file = "HeyReach_Customer_Insights_COMPLETE_FINAL.xlsx"
    analyzer.export_to_excel(combined_df, output_file)
    
    print("\n" + "="*70)
    print("✅ COMPLETE ANALYSIS FINISHED!")
    print("="*70)
    print(f"📊 Total analyzed: {len(combined_df):,} conversations")
    print(f"🔍 Pain points found: {len(combined_df[combined_df['pain_point_1'].notna() & (combined_df['pain_point_1'] != '')]):,}")
    print(f"⭐ Qualified leads: {len(combined_df[combined_df['is_qualified_lead'] == True]):,}")
    print(f"\n📁 Output file: {output_file}")
    print("="*70)

if __name__ == "__main__":
    main()

