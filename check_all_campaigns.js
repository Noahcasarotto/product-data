#!/usr/bin/env node

/**
 * List all campaigns and LinkedIn accounts in HeyReach
 */

const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.HR_API_KEY;

async function listAllCampaigns() {
    console.log('🔍 Fetching ALL campaigns from HeyReach...\n');
    
    const headers = {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
    };
    
    try {
        const resp = await axios.post(
            'https://api.heyreach.io/api/public/campaign/GetAll',
            {},
            { headers }
        );
        
        const campaigns = resp.data.items || resp.data.data || [];
        console.log(`✅ Found ${campaigns.length} campaigns:\n`);
        
        campaigns.forEach((c, i) => {
            console.log(`${i + 1}. ${c.name || c.title || 'Unnamed'} (ID: ${c.id})`);
            console.log(`   Status: ${c.status || 'Unknown'}`);
            console.log(`   Created: ${c.createdAt || c.created_at || 'Unknown'}\n`);
        });
        
        console.log(`\n📧 Fetching LinkedIn accounts...\n`);
        
        const acctResp = await axios.post(
            'https://api.heyreach.io/api/public/li_account/GetAll',
            {},
            { headers }
        );
        
        const accounts = acctResp.data.items || acctResp.data.data || [];
        console.log(`✅ Found ${accounts.length} LinkedIn accounts:\n`);
        
        accounts.forEach((a, i) => {
            console.log(`${i + 1}. ${a.name || a.firstName || 'Unknown'} (ID: ${a.id})`);
            console.log(`   Email: ${a.emailAddress || a.email || 'Unknown'}\n`);
        });
        
        // Now try to get total conversation count
        console.log(`\n💬 Checking total conversations across all campaigns...\n`);
        
        let totalConvs = 0;
        for (const campaign of campaigns) {
            for (const account of accounts) {
                try {
                    const convResp = await axios.post(
                        process.env.HR_GET_CONVERSATIONS_V2_URL,
                        {
                            filters: {
                                campaignIds: [campaign.id],
                                linkedInAccountIds: [account.id]
                            },
                            limit: 1,
                            offset: 0
                        },
                        { headers }
                    );
                    
                    const count = convResp.data.totalCount || 0;
                    if (count > 0) {
                        console.log(`   ${campaign.name || campaign.id} + ${account.name || account.id}: ${count} conversations`);
                        totalConvs += count;
                    }
                } catch (e) {
                    // Skip errors
                }
            }
        }
        
        console.log(`\n🎯 TOTAL CONVERSATIONS: ${totalConvs}\n`);
        console.log(`To extract all conversations, make sure your .env has:`);
        console.log(`HR_INBOX_CAMPAIGN_IDS=` + campaigns.map(c => c.id).join(','));
        console.log(`HR_INBOX_ACCOUNT_IDS=` + accounts.map(a => a.id).join(','));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

listAllCampaigns();

