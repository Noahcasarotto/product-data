#!/usr/bin/env node

/**
 * Attio Full Reset Script
 * 1. Backup all people and messages to JSON
 * 2. Delete all LinkedIn Messages
 * 3. Delete all People (or just HeyReach-created ones)
 * 4. Generate cleanup report
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

require('dotenv').config();

const ATTIO_API_KEY = process.env.ATTIO_API_KEY;
const AT_API_BASE = 'https://api.attio.com';

if (!ATTIO_API_KEY) {
  console.error('❌ ATTIO_API_KEY not found in .env');
  process.exit(1);
}

const axiosClient = axios.create({
  timeout: 60000,
  headers: { 'User-Agent': 'Attio-Reset-Script/1.0' }
});

// Create backup directory
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupDir = path.join('exports', `attio_backup_${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });

console.log(`📁 Backup directory: ${backupDir}\n`);

/**
 * Fetch all records from an object (with pagination)
 */
async function fetchAllRecords(objectSlug, objectName) {
  console.log(`📥 Fetching all ${objectName}...`);

  const allRecords = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    try {
      const resp = await axiosClient.post(
        `${AT_API_BASE}/v2/objects/${objectSlug}/records/query`,
        { limit, offset },
        { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
      );

      const records = resp.data?.data || [];
      allRecords.push(...records);

      console.log(`   Fetched ${allRecords.length} ${objectName}...`);

      if (records.length < limit) break;
      offset += limit;
    } catch (e) {
      console.error(`   ❌ Error fetching ${objectName}:`, e.message);
      break;
    }
  }

  console.log(`   ✅ Total ${objectName}: ${allRecords.length}\n`);
  return allRecords;
}

/**
 * Delete all records from an object
 */
async function deleteAllRecords(objectId, objectName, records) {
  console.log(`🗑️  Deleting ${records.length} ${objectName}...`);

  let deleted = 0;
  let failed = 0;

  for (const record of records) {
    const recordId = record.id?.record_id;
    if (!recordId) {
      failed++;
      continue;
    }

    try {
      await axiosClient.delete(
        `${AT_API_BASE}/v2/objects/${objectId}/records/${recordId}`,
        { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
      );
      deleted++;

      if (deleted % 10 === 0) {
        console.log(`   Deleted ${deleted}/${records.length}...`);
      }
    } catch (e) {
      console.error(`   ❌ Failed to delete ${recordId}:`, e.message);
      failed++;
    }
  }

  console.log(`   ✅ Deleted: ${deleted}`);
  console.log(`   ❌ Failed: ${failed}\n`);

  return { deleted, failed };
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Attio Full Reset...\n');

  const report = {
    timestamp,
    backup_directory: backupDir,
    before: {},
    after: {},
    deleted: {},
    errors: []
  };

  try {
    // Step 1: Backup People
    const people = await fetchAllRecords('people', 'People');
    report.before.people = people.length;
    fs.writeFileSync(
      path.join(backupDir, 'people_backup.json'),
      JSON.stringify(people, null, 2)
    );
    console.log(`💾 Saved backup: people_backup.json\n`);

    // Step 2: Backup LinkedIn Messages
    const messages = await fetchAllRecords('linkedin_messages', 'LinkedIn Messages');
    report.before.messages = messages.length;
    fs.writeFileSync(
      path.join(backupDir, 'messages_backup.json'),
      JSON.stringify(messages, null, 2)
    );
    console.log(`💾 Saved backup: messages_backup.json\n`);

    // Step 3: Get object IDs for deletion
    const objectsResp = await axiosClient.get(
      `${AT_API_BASE}/v2/objects`,
      { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
    );

    const objects = objectsResp.data?.data || [];
    const peopleObj = objects.find(o => o.api_slug === 'people');
    const messagesObj = objects.find(o => o.api_slug === 'linkedin_messages');

    if (!peopleObj || !messagesObj) {
      throw new Error('Could not find object IDs');
    }

    console.log(`📋 People object ID: ${peopleObj.id.object_id}`);
    console.log(`📋 Messages object ID: ${messagesObj.id.object_id}\n`);

    // Step 4: Ask for confirmation
    console.log('⚠️  WARNING: About to delete:');
    console.log(`   - ${people.length} People records`);
    console.log(`   - ${messages.length} LinkedIn Message records`);
    console.log('\n   Backups saved to:', backupDir);
    console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 5: Delete Messages first (to avoid orphaned references)
    const msgResult = await deleteAllRecords(
      messagesObj.id.object_id,
      'LinkedIn Messages',
      messages
    );
    report.deleted.messages = msgResult;

    // Step 6: Delete People
    const peopleResult = await deleteAllRecords(
      peopleObj.id.object_id,
      'People',
      people
    );
    report.deleted.people = peopleResult;

    // Step 7: Verify deletion
    console.log('🔍 Verifying deletion...');
    const remainingPeople = await fetchAllRecords('people', 'Remaining People');
    const remainingMessages = await fetchAllRecords('linkedin_messages', 'Remaining Messages');

    report.after.people = remainingPeople.length;
    report.after.messages = remainingMessages.length;

    // Step 8: Save report
    fs.writeFileSync(
      path.join(backupDir, 'cleanup_report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n✅ CLEANUP COMPLETE!\n');
    console.log('📊 Summary:');
    console.log(`   Before: ${report.before.people} people, ${report.before.messages} messages`);
    console.log(`   Deleted: ${report.deleted.people.deleted} people, ${report.deleted.messages.deleted} messages`);
    console.log(`   After: ${report.after.people} people, ${report.after.messages} messages`);
    console.log(`\n📁 Backups and report saved to: ${backupDir}`);

    if (report.after.people > 0 || report.after.messages > 0) {
      console.log('\n⚠️  WARNING: Some records remain. Check cleanup_report.json for details.');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    report.errors.push({
      message: error.message,
      stack: error.stack
    });

    fs.writeFileSync(
      path.join(backupDir, 'cleanup_report.json'),
      JSON.stringify(report, null, 2)
    );

    process.exit(1);
  }
}

main().catch(console.error);
