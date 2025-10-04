#!/usr/bin/env python3
"""
Continue analysis from where it left off - only analyze conversations not yet processed
"""

import pandas as pd
import os
import sys

# Set environment variables
os.environ['OPENAI_API_KEY'] = os.getenv('OPENAI_API_KEY', '')
os.environ['TEST_MODE'] = 'false'
os.environ['OPENAI_MODEL'] = 'gpt-5-mini'

# Import and run the main analyzer
from analyze_conversations import ConversationAnalyzer

def main():
    print("="*70)
    print("Continuing Analysis with GPT-5 mini")
    print("="*70)
    
    MESSAGES_CSV = "exports/attio/messages.csv"
    PEOPLE_CSV = "exports/attio/people.csv"
    EXISTING_RESULTS = "HeyReach_Customer_Insights_20251002_191635.xlsx"
    
    # Check if previous results exist
    if not os.path.exists(EXISTING_RESULTS):
        print(f"❌ Previous results file not found: {EXISTING_RESULTS}")
        print("Run analyze_conversations.py first")
        return
    
    print(f"\n📥 Loading previous results from: {EXISTING_RESULTS}")
    existing_df = pd.read_excel(EXISTING_RESULTS, sheet_name='Customer Insights')
    analyzed_urls = set(existing_df['linkedin_url'].dropna())
    print(f"   Already analyzed: {len(analyzed_urls)} conversations")
    
    # Load all conversations
    analyzer = ConversationAnalyzer(use_anthropic=False)
    all_conversations = analyzer.load_conversations(MESSAGES_CSV, PEOPLE_CSV)
    
    # Filter to only unanalyzed conversations
    remaining_conversations = {
        url: data for url, data in all_conversations.items()
        if url not in analyzed_urls
    }
    
    print(f"   Remaining to analyze: {len(remaining_conversations)} conversations")
    
    if len(remaining_conversations) == 0:
        print("✅ All conversations already analyzed!")
        return
    
    # Analyze remaining conversations
    print(f"\n🤖 Analyzing remaining {len(remaining_conversations)} conversations with GPT-5 mini...")
    new_results_df = analyzer.analyze_all_conversations(remaining_conversations)
    
    # Combine with existing results
    print(f"\n📊 Combining results...")
    combined_df = pd.concat([existing_df, new_results_df], ignore_index=True)
    
    # Export combined results
    output_file = "HeyReach_Customer_Insights_COMPLETE.xlsx"
    analyzer.export_to_excel(combined_df, output_file)
    
    print("\n" + "="*70)
    print("COMPLETE ANALYSIS FINISHED!")
    print("="*70)
    print(f"📊 Total analyzed: {len(combined_df):,} conversations")
    print(f"🔍 Pain points found: {len(combined_df[combined_df['pain_point_1'] != '']):,}")
    print(f"💡 Feature suggestions: {len(combined_df[combined_df['feature_1'] != '']):,}")
    print(f"⭐ Qualified leads: {len(combined_df[combined_df['is_qualified_lead'] == True]):,}")
    print(f"\n📁 Output file: {output_file}")
    print("="*70)

if __name__ == "__main__":
    main()

