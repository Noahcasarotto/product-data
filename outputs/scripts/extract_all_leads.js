#!/usr/bin/env node
/**
 * Extract ALL leads from HeyReach (including those without conversations)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEY = process.env.HR_API_KEY;
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'exports/attio';

async function makeRequest(url, body = {}) {
    // Try different header formats like the working inbox endpoint
    const headerVariants = [
        { 'Authorization': `Bearer ${API_KEY}` },
        { 'Authorization': `Api-Key ${API_KEY}` },
        { 'x-api-key': API_KEY },
        { 'X-API-KEY': API_KEY },
        { 'api-key': API_KEY }
    ];
    
    for (const headers of headerVariants) {
        try {
            const resp = await axios.post(url, body, {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Origin': 'https://app.heyreach.io',
                    'Referer': 'https://app.heyreach.io/'
                }
            });
            if (resp.status >= 200 && resp.status < 300) {
                return resp;
            }
        } catch (error) {
            if (error.response && error.response.status === 401) {
                continue; // Try next header variant
            }
            throw error;
        }
    }
    throw new Error(`All authentication methods failed for ${url}`);
}

async function getAllCampaigns() {
    const resp = await makeRequest('https://api.heyreach.io/api/public/campaign/GetAll');
    return resp.data.items || resp.data.data || [];
}

async function getLeadsFromCampaign(campaignId) {
    console.log(`\n📥 Fetching leads from campaign ${campaignId}...`);
    
    const allLeads = [];
    let page = 1;
    
    while (true) {
        try {
            const resp = await makeRequest(
                'https://api.heyreach.io/api/public/lead/GetLeadsFromCampaign',
                {
                    campaignId: campaignId,
                    page: page,
                    limit: 100
                }
            );
            
            const leads = resp.data.items || resp.data.data || resp.data.leads || [];
            
            if (!leads || leads.length === 0) break;
            
            console.log(`   Page ${page}: ${leads.length} leads`);
            allLeads.push(...leads);
            page++;
            
            if (leads.length < 100) break; // Last page
            
        } catch (error) {
            console.error(`   ❌ Error on page ${page}:`, error.message);
            break;
        }
    }
    
    return allLeads;
}

async function main() {
    console.log('🚀 Extracting ALL leads from HeyReach...\n');
    
    try {
        const campaigns = await getAllCampaigns();
        console.log(`\n✅ Found ${campaigns.length} campaigns\n`);
        
        const allLeads = [];
        const leadsByLinkedIn = new Map();
        
        for (const campaign of campaigns) {
            const campaignLeads = await getLeadsFromCampaign(campaign.id);
            
            for (const lead of campaignLeads) {
                const liUrl = lead.linkedinProfileUrl || lead.linkedin_url || lead.profileUrl || '';
                if (liUrl && !leadsByLinkedIn.has(liUrl)) {
                    leadsByLinkedIn.set(liUrl, {
                        ...lead,
                        campaign_name: campaign.name || campaign.title,
                        campaign_id: campaign.id
                    });
                }
            }
        }
        
        console.log(`\n✅ Total unique leads: ${leadsByLinkedIn.size}`);
        
        // Convert to array and save
        const leadsArray = Array.from(leadsByLinkedIn.values());
        
        // Save as JSON
        const jsonPath = path.join(OUTPUT_DIR, 'all_leads_complete.json');
        fs.writeFileSync(jsonPath, JSON.stringify(leadsArray, null, 2));
        console.log(`✅ Saved to: ${jsonPath}`);
        
        // Save as CSV
        const csvPath = path.join(OUTPUT_DIR, 'all_leads_complete.csv');
        const csvHeader = 'linkedin_url,first_name,last_name,full_name,job_title,company_name,campaign_name,campaign_id,status\n';
        const csvRows = leadsArray.map(lead => {
            const liUrl = lead.linkedinProfileUrl || lead.linkedin_url || lead.profileUrl || '';
            const firstName = lead.firstName || lead.first_name || '';
            const lastName = lead.lastName || lead.last_name || '';
            const fullName = lead.fullName || lead.full_name || `${firstName} ${lastName}`.trim();
            const jobTitle = lead.title || lead.job_title || lead.position || '';
            const companyName = lead.companyName || lead.company_name || '';
            const campaignName = lead.campaign_name || '';
            const campaignId = lead.campaign_id || '';
            const status = lead.status || lead.lead_status || '';
            
            return `"${liUrl}","${firstName}","${lastName}","${fullName}","${jobTitle}","${companyName}","${campaignName}","${campaignId}","${status}"`;
        }).join('\n');
        
        fs.writeFileSync(csvPath, csvHeader + csvRows);
        console.log(`✅ Saved to: ${csvPath}`);
        
        console.log(`\n🎉 Done! Extracted ${leadsArray.length} total leads`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

main();

