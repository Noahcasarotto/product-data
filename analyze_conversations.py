#!/usr/bin/env python3
"""
HeyReach Conversation Analyzer
Aggregates conversations by lead and uses LLM to extract pain points and feature suggestions
"""

import pandas as pd
import json
import os
from datetime import datetime
from typing import List, Dict, Any
import time

# LLM imports - using OpenAI by default, can switch to Anthropic
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False
    print("⚠️  OpenAI not installed. Run: pip install openai")

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


class ConversationAnalyzer:
    def __init__(self, use_anthropic=False):
        self.use_anthropic = use_anthropic
        
        if use_anthropic:
            if not HAS_ANTHROPIC:
                raise Exception("Anthropic not installed. Run: pip install anthropic")
            self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
            self.model = "claude-3-5-sonnet-20241022"
        else:
            if not HAS_OPENAI:
                raise Exception("OpenAI not installed. Run: pip install openai")
            self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            self.model = "gpt-4o-mini"  # Fast and cost-effective
    
    def load_conversations(self, messages_csv: str, people_csv: str) -> Dict[str, Any]:
        """Load and aggregate conversations by lead."""
        print("📥 Loading conversation data...")
        
        messages_df = pd.read_csv(messages_csv)
        people_df = pd.read_csv(people_csv)
        
        print(f"   Loaded {len(messages_df):,} messages from {len(people_df):,} people")
        
        # Group messages by person (using linkedin_url as key)
        conversations_by_person = {}
        
        for linkedin_url in messages_df['person_match_linkedin_url'].unique():
            if pd.isna(linkedin_url):
                continue
            
            # Get all messages for this person
            person_messages = messages_df[
                messages_df['person_match_linkedin_url'] == linkedin_url
            ].sort_values('timestamp')
            
            # Get person details
            person_info = people_df[
                people_df['linkedin_url'] == linkedin_url
            ].iloc[0].to_dict() if len(people_df[people_df['linkedin_url'] == linkedin_url]) > 0 else {}
            
            # Build conversation thread
            conversation = []
            for _, msg in person_messages.iterrows():
                conversation.append({
                    'timestamp': msg['timestamp'],
                    'direction': msg['direction'],
                    'message': msg['body'],
                    'channel': msg.get('channel', 'dm')
                })
            
            # Only analyze conversations with replies (received messages)
            has_reply = any(msg['direction'] == 'received' for msg in conversation)
            
            if has_reply and len(conversation) > 0:
                conversations_by_person[linkedin_url] = {
                    'person': person_info,
                    'conversation': conversation,
                    'message_count': len(conversation),
                    'reply_count': sum(1 for msg in conversation if msg['direction'] == 'received')
                }
        
        print(f"✅ Aggregated {len(conversations_by_person):,} conversations with replies")
        return conversations_by_person
    
    def format_conversation_for_llm(self, conversation: List[Dict]) -> str:
        """Format conversation thread for LLM analysis."""
        formatted = []
        
        for msg in conversation:
            sender = "You" if msg['direction'] == 'sent' else "Lead"
            timestamp = msg['timestamp'][:10] if msg['timestamp'] else 'Unknown date'
            message = msg['message']
            
            formatted.append(f"[{timestamp}] {sender}: {message}")
        
        return "\n\n".join(formatted)
    
    def analyze_conversation_with_llm(self, person_info: Dict, conversation: List[Dict]) -> Dict[str, Any]:
        """Use LLM to extract pain points and feature suggestions."""
        
        person_name = person_info.get('full_name', 'Unknown')
        company = person_info.get('company_name', 'Unknown')
        job_title = person_info.get('job_title', 'Unknown')
        
        conversation_text = self.format_conversation_for_llm(conversation)
        
        prompt = f"""You are analyzing a LinkedIn conversation with a potential customer to extract product insights.

**Contact Information:**
- Name: {person_name}
- Company: {company}
- Title: {job_title}

**Conversation:**
{conversation_text}

**Your Task:**
Analyze this conversation and extract:

1. **Pain Points** (up to 4): What problems, challenges, or frustrations did the lead mention or imply?
2. **Feature Suggestions** (4 specific features): Based on the pain points, what specific product features would solve their problems?

**Output Format (JSON only):**
{{
    "pain_points": [
        {{"point": "Description of pain point 1", "severity": "high|medium|low"}},
        {{"point": "Description of pain point 2", "severity": "high|medium|low"}},
        ...
    ],
    "feature_suggestions": [
        {{"feature": "Feature name/description 1", "addresses_pain_point": "Which pain point it solves"}},
        {{"feature": "Feature name/description 2", "addresses_pain_point": "Which pain point it solves"}},
        ...
    ],
    "engagement_level": "high|medium|low",
    "is_qualified_lead": true|false,
    "summary": "One sentence summary of the conversation"
}}

**Important:**
- If no clear pain points are mentioned, return empty arrays
- Be specific and actionable with feature suggestions
- Only extract what's actually in the conversation, don't assume
- Output ONLY valid JSON, no extra text"""

        try:
            if self.use_anthropic:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=2000,
                    messages=[{
                        "role": "user",
                        "content": prompt
                    }]
                )
                result = response.content[0].text
            else:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "user",
                        "content": prompt
                    }],
                    temperature=0.3,
                    response_format={"type": "json_object"}
                )
                result = response.choices[0].message.content
            
            # Parse JSON response
            analysis = json.loads(result)
            return analysis
        
        except Exception as e:
            print(f"   ⚠️  Error analyzing conversation for {person_name}: {str(e)[:100]}")
            return {
                "pain_points": [],
                "feature_suggestions": [],
                "engagement_level": "unknown",
                "is_qualified_lead": False,
                "summary": "Error during analysis",
                "error": str(e)
            }
    
    def analyze_all_conversations(self, conversations: Dict[str, Any]) -> pd.DataFrame:
        """Analyze all conversations and return results as DataFrame."""
        
        print(f"\n🤖 Analyzing {len(conversations):,} conversations with LLM...")
        print(f"   Using: {'Anthropic Claude' if self.use_anthropic else 'OpenAI GPT-4'}")
        
        results = []
        total = len(conversations)
        
        for idx, (linkedin_url, data) in enumerate(conversations.items(), 1):
            person = data['person']
            conversation = data['conversation']
            
            person_name = person.get('full_name', 'Unknown')
            print(f"\n[{idx}/{total}] Analyzing: {person_name}")
            print(f"   Messages: {len(conversation)} ({data['reply_count']} replies)")
            
            # Analyze with LLM
            analysis = self.analyze_conversation_with_llm(person, conversation)
            
            # Combine person info with analysis
            result = {
                # Person info
                'linkedin_url': linkedin_url,
                'full_name': person.get('full_name', ''),
                'first_name': person.get('first_name', ''),
                'last_name': person.get('last_name', ''),
                'job_title': person.get('job_title', ''),
                'company_name': person.get('company_name', ''),
                'campaign_name': person.get('campaign_name', ''),
                
                # Conversation stats
                'total_messages': len(conversation),
                'reply_count': data['reply_count'],
                'first_message_date': conversation[0]['timestamp'][:10] if conversation else '',
                'last_message_date': conversation[-1]['timestamp'][:10] if conversation else '',
                
                # LLM Analysis
                'summary': analysis.get('summary', ''),
                'engagement_level': analysis.get('engagement_level', 'unknown'),
                'is_qualified_lead': analysis.get('is_qualified_lead', False),
                
                # Pain points (up to 4)
                'pain_point_1': '',
                'pain_point_1_severity': '',
                'pain_point_2': '',
                'pain_point_2_severity': '',
                'pain_point_3': '',
                'pain_point_3_severity': '',
                'pain_point_4': '',
                'pain_point_4_severity': '',
                
                # Features (4)
                'feature_1': '',
                'feature_1_addresses': '',
                'feature_2': '',
                'feature_2_addresses': '',
                'feature_3': '',
                'feature_3_addresses': '',
                'feature_4': '',
                'feature_4_addresses': '',
                
                # Raw analysis for reference
                'raw_analysis': json.dumps(analysis)
            }
            
            # Fill in pain points
            pain_points = analysis.get('pain_points', [])
            for i, pp in enumerate(pain_points[:4], 1):
                result[f'pain_point_{i}'] = pp.get('point', '')
                result[f'pain_point_{i}_severity'] = pp.get('severity', '')
            
            # Fill in features
            features = analysis.get('feature_suggestions', [])
            for i, feat in enumerate(features[:4], 1):
                result[f'feature_{i}'] = feat.get('feature', '')
                result[f'feature_{i}_addresses'] = feat.get('addresses_pain_point', '')
            
            results.append(result)
            
            # Show progress
            if len(pain_points) > 0:
                print(f"   ✅ Found {len(pain_points)} pain points, {len(features)} features")
            else:
                print(f"   ℹ️  No clear pain points extracted")
            
            # Rate limiting
            time.sleep(0.5)
        
        return pd.DataFrame(results)
    
    def export_to_excel(self, df: pd.DataFrame, filename: str = None):
        """Export analysis results to Excel."""
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"HeyReach_Customer_Insights_{timestamp}.xlsx"
        
        print(f"\n💾 Exporting to Excel: {filename}")
        
        with pd.ExcelWriter(filename, engine='openpyxl') as writer:
            # Main analysis sheet
            df.to_excel(writer, sheet_name='Customer Insights', index=False)
            
            # Summary statistics
            summary_data = {
                'Metric': [
                    'Total Conversations Analyzed',
                    'High Engagement Leads',
                    'Qualified Leads',
                    'Total Pain Points Identified',
                    'Total Feature Suggestions',
                    'Conversations with Pain Points'
                ],
                'Count': [
                    len(df),
                    len(df[df['engagement_level'] == 'high']),
                    len(df[df['is_qualified_lead'] == True]),
                    len(df[df['pain_point_1'] != '']),
                    len(df[df['feature_1'] != '']),
                    len(df[df['pain_point_1'] != ''])
                ]
            }
            summary_df = pd.DataFrame(summary_data)
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Pain points aggregation
            pain_points_list = []
            for _, row in df.iterrows():
                for i in range(1, 5):
                    pp = row.get(f'pain_point_{i}', '')
                    if pp:
                        pain_points_list.append({
                            'pain_point': pp,
                            'severity': row.get(f'pain_point_{i}_severity', ''),
                            'company': row['company_name'],
                            'contact': row['full_name']
                        })
            
            if pain_points_list:
                pain_points_df = pd.DataFrame(pain_points_list)
                pain_points_df.to_excel(writer, sheet_name='All Pain Points', index=False)
            
            # Feature suggestions aggregation
            features_list = []
            for _, row in df.iterrows():
                for i in range(1, 5):
                    feat = row.get(f'feature_{i}', '')
                    if feat:
                        features_list.append({
                            'feature': feat,
                            'addresses': row.get(f'feature_{i}_addresses', ''),
                            'suggested_by': row['full_name'],
                            'company': row['company_name']
                        })
            
            if features_list:
                features_df = pd.DataFrame(features_list)
                
                # Count feature frequency
                feature_counts = features_df['feature'].value_counts().reset_index()
                feature_counts.columns = ['feature', 'times_suggested']
                feature_counts.to_excel(writer, sheet_name='Feature Frequency', index=False)
                
                features_df.to_excel(writer, sheet_name='All Features', index=False)
        
        print(f"✅ Exported analysis to: {filename}")
        return filename


def main():
    print("="*70)
    print("HeyReach Customer Insights Analyzer")
    print("="*70)
    
    # Configuration
    MESSAGES_CSV = "exports/attio/messages.csv"
    PEOPLE_CSV = "exports/attio/people.csv"
    USE_ANTHROPIC = os.getenv('USE_ANTHROPIC', '').lower() in ['true', '1', 'yes']
    
    # Check API keys
    if USE_ANTHROPIC:
        if not os.getenv('ANTHROPIC_API_KEY'):
            print("❌ ANTHROPIC_API_KEY not set in environment")
            print("   Set it with: export ANTHROPIC_API_KEY=your_key_here")
            return
    else:
        if not os.getenv('OPENAI_API_KEY'):
            print("❌ OPENAI_API_KEY not set in environment")
            print("   Set it with: export OPENAI_API_KEY=your_key_here")
            print("\n   Or use Anthropic: export USE_ANTHROPIC=true")
            return
    
    # Initialize analyzer
    analyzer = ConversationAnalyzer(use_anthropic=USE_ANTHROPIC)
    
    # Load conversations
    conversations = analyzer.load_conversations(MESSAGES_CSV, PEOPLE_CSV)
    
    if len(conversations) == 0:
        print("❌ No conversations with replies found")
        return
    
    # Option to test with subset first
    test_mode = os.getenv('TEST_MODE', '').lower() in ['true', '1', 'yes']
    if test_mode:
        print("\n⚙️  TEST MODE: Analyzing first 10 conversations only")
        conversations = dict(list(conversations.items())[:10])
    
    # Analyze all conversations
    results_df = analyzer.analyze_all_conversations(conversations)
    
    # Export results
    output_file = analyzer.export_to_excel(results_df)
    
    # Print summary
    print("\n" + "="*70)
    print("ANALYSIS COMPLETE!")
    print("="*70)
    print(f"📊 Analyzed: {len(results_df):,} conversations")
    print(f"🔍 Pain points found: {len(results_df[results_df['pain_point_1'] != '']):,}")
    print(f"💡 Feature suggestions: {len(results_df[results_df['feature_1'] != '']):,}")
    print(f"⭐ Qualified leads: {len(results_df[results_df['is_qualified_lead'] == True]):,}")
    print(f"\n📁 Output file: {output_file}")
    print("="*70)


if __name__ == "__main__":
    main()

