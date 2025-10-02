#!/usr/bin/env node

/**
 * Complete Data Reset - Delete ALL messages and HeyReach people
 * Ensures clean slate for proof-of-concept
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = axios.create({
  baseURL: 'https://api.attio.com/v2',
  headers: {
    'Authorization': `Bearer ${process.env.ATTIO_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

async function deleteAllMessages(messagesObjId) {
  console.log('📋 Step 1: Deleting ALL LinkedIn messages...\n');

  let totalDeleted = 0;
  let batchNum = 1;

  while (true) {
    const messagesResp = await client.post(`/objects/${messagesObjId}/records/query`, {
      limit: 100
    });
    const messages = messagesResp.data.data;

    if (messages.length === 0) break;

    console.log(`   Batch ${batchNum}: Found ${messages.length} messages`);

    for (const msg of messages) {
      try {
        await client.delete(`/objects/${messagesObjId}/records/${msg.id.record_id}`);
        totalDeleted++;
      } catch (e) {
        console.error(`   ⚠️  Failed: ${e.message}`);
      }
    }

    console.log(`   ✅ Deleted batch ${batchNum} (Total: ${totalDeleted})`);
    batchNum++;

    if (batchNum > 20) {
      console.log('   ⚠️  Safety limit reached (20 batches)');
      break;
    }
  }

  return totalDeleted;
}

async function deleteAllHeyReachPeople(peopleObjId) {
  console.log('\n📋 Step 2: Deleting ALL HeyReach people...\n');

  const peopleResp = await client.post(`/objects/${peopleObjId}/records/query`, {
    limit: 500
  });

  const heyreachPeople = peopleResp.data.data.filter(p => {
    const linkedinUrl = p.values.linkedin_url_6?.[0]?.value || '';
    const leadSource = p.values.lead_source?.[0]?.value || '';
    return linkedinUrl || leadSource === 'HeyReach';
  });

  console.log(`   Found ${heyreachPeople.length} HeyReach people to delete`);

  let deleted = 0;
  for (const person of heyreachPeople) {
    const name = person.values.name?.[0]?.full_name || person.values.name?.full_name || 'Unknown';
    try {
      await client.delete(`/objects/${peopleObjId}/records/${person.id.record_id}`);
      console.log(`   ✅ Deleted: ${name}`);
      deleted++;
    } catch (e) {
      console.error(`   ⚠️  Failed to delete ${name}: ${e.message}`);
    }
  }

  return deleted;
}

async function clearSyncState() {
  console.log('\n📋 Step 3: Clearing sync state...\n');

  const syncStatePath = path.join('.sync', 'sync_state.json');

  if (fs.existsSync(syncStatePath)) {
    fs.writeFileSync(syncStatePath, JSON.stringify({
      last_sync: null,
      threads: {},
      people: {}
    }, null, 2));
    console.log('   ✅ Cleared sync state');
  } else {
    console.log('   ℹ️  No sync state to clear');
  }
}

async function main() {
  console.log('🧹 COMPLETE DATA RESET\n');
  console.log('='.repeat(70));

  try {
    const objectsResp = await client.get('/objects');
    const objects = objectsResp.data.data;
    const peopleObj = objects.find(o => o.api_slug === 'people');
    const messagesObj = objects.find(o => o.api_slug === 'linkedin_messages');

    if (!peopleObj || !messagesObj) {
      console.error('❌ Could not find required objects');
      return;
    }

    const peopleObjId = peopleObj.id.object_id;
    const messagesObjId = messagesObj.id.object_id;

    const messagesDeleted = await deleteAllMessages(messagesObjId);
    const peopleDeleted = await deleteAllHeyReachPeople(peopleObjId);
    await clearSyncState();

    console.log('\n' + '='.repeat(70));
    console.log('✅ COMPLETE DATA RESET FINISHED!\n');
    console.log(`   📊 Results:`);
    console.log(`      - Deleted ${messagesDeleted} messages`);
    console.log(`      - Deleted ${peopleDeleted} people`);
    console.log(`      - Cleared sync state`);
    console.log('\n💡 Ready for fresh proof-of-concept sync!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.status, JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();