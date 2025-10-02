#!/usr/bin/env node

/**
 * Attio Streaming Backup & Cleanup Script
 * Optimized for large datasets (10,000+ records)
 *
 * Features:
 * - Streaming backup (writes to disk incrementally, not in memory)
 * - Progress tracking with time estimates
 * - Graceful error handling
 * - Detailed logging
 * - Safe deletion with verification
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
  timeout: 120000, // 2 min timeout per request
  headers: { 'User-Agent': 'Attio-Streaming-Backup/1.0' }
});

// Create backup directory
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupDir = path.join('exports', `attio_backup_${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });

console.log(`📁 Backup directory: ${backupDir}\n`);

// Create log file
const logFile = path.join(backupDir, 'backup.log');
function log(message) {
  const timestampedMsg = `[${new Date().toISOString()}] ${message}`;
  console.log(timestampedMsg);
  fs.appendFileSync(logFile, timestampedMsg + '\n');
}

/**
 * Stream fetch all records to disk (pagination)
 */
async function streamBackupRecords(objectSlug, objectName, outputFilename) {
  log(`\n📥 Starting streaming backup of ${objectName}...`);

  const outputPath = path.join(backupDir, outputFilename);
  const statsPath = path.join(backupDir, `${outputFilename}.stats.json`);

  // Initialize output file with array start
  fs.writeFileSync(outputPath, '[\n');

  let totalRecords = 0;
  let offset = 0;
  const limit = 100;
  const startTime = Date.now();
  let isFirstRecord = true;

  while (true) {
    try {
      const batchStart = Date.now();

      const resp = await axiosClient.post(
        `${AT_API_BASE}/v2/objects/${objectSlug}/records/query`,
        { limit, offset },
        { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
      );

      const records = resp.data?.data || [];

      if (records.length === 0) {
        log(`   ✅ Completed: ${totalRecords} ${objectName} backed up`);
        break;
      }

      // Write records to file (streaming)
      for (const record of records) {
        if (!isFirstRecord) {
          fs.appendFileSync(outputPath, ',\n');
        }
        fs.appendFileSync(outputPath, '  ' + JSON.stringify(record, null, 2).split('\n').join('\n  '));
        isFirstRecord = false;
      }

      totalRecords += records.length;
      offset += limit;

      // Progress tracking
      const batchTime = Date.now() - batchStart;
      const totalTime = Date.now() - startTime;
      const avgTimePerBatch = totalTime / (offset / limit);
      const recordsPerSec = (totalRecords / (totalTime / 1000)).toFixed(1);

      log(`   Backed up ${totalRecords} ${objectName} (${recordsPerSec}/sec, ${batchTime}ms/batch)...`);

      // Save intermediate stats every 1000 records
      if (totalRecords % 1000 === 0) {
        fs.writeFileSync(statsPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          total_backed_up: totalRecords,
          time_elapsed_sec: (totalTime / 1000).toFixed(1),
          records_per_sec: recordsPerSec
        }, null, 2));
      }

      // Safety check: if no more records
      if (records.length < limit) {
        log(`   ✅ Completed: ${totalRecords} ${objectName} backed up`);
        break;
      }

    } catch (e) {
      log(`   ❌ Error at offset ${offset}: ${e.message}`);

      // Retry logic
      if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') {
        log(`   🔄 Retrying in 5 seconds...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      // Fatal error
      log(`   ❌ Fatal error, stopping backup at ${totalRecords} records`);
      break;
    }
  }

  // Close array in JSON file
  fs.appendFileSync(outputPath, '\n]\n');

  // Final stats
  const totalTime = Date.now() - startTime;
  const stats = {
    object_name: objectName,
    total_records: totalRecords,
    time_elapsed_sec: (totalTime / 1000).toFixed(1),
    records_per_sec: (totalRecords / (totalTime / 1000)).toFixed(1),
    backup_file: outputFilename,
    completed_at: new Date().toISOString()
  };

  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  log(`   📊 Stats saved to ${outputFilename}.stats.json\n`);

  return { totalRecords, stats };
}

/**
 * Get object IDs from Attio
 */
async function getObjectIds() {
  log('📋 Fetching object IDs...');

  const resp = await axiosClient.get(
    `${AT_API_BASE}/v2/objects`,
    { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
  );

  const objects = resp.data?.data || [];
  const peopleObj = objects.find(o => o.api_slug === 'people');
  const messagesObj = objects.find(o => o.api_slug === 'linkedin_messages');

  if (!peopleObj || !messagesObj) {
    throw new Error('Could not find required object IDs');
  }

  log(`   People object: ${peopleObj.id.object_id}`);
  log(`   Messages object: ${messagesObj.id.object_id}\n`);

  return {
    people: peopleObj.id.object_id,
    messages: messagesObj.id.object_id
  };
}

/**
 * Delete records in batches
 */
async function deleteRecordsBatch(objectId, objectName, recordIds) {
  log(`\n🗑️  Deleting ${recordIds.length} ${objectName}...`);

  let deleted = 0;
  let failed = 0;
  const batchSize = 10; // Delete 10 at a time
  const startTime = Date.now();

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);

    const deletePromises = batch.map(recordId =>
      axiosClient.delete(
        `${AT_API_BASE}/v2/objects/${objectId}/records/${recordId}`,
        { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
      ).then(() => ({ success: true }))
        .catch(e => ({ success: false, error: e.message }))
    );

    const results = await Promise.all(deletePromises);

    deleted += results.filter(r => r.success).length;
    failed += results.filter(r => !r.success).length;

    // Progress every 100 deletions
    if (deleted % 100 === 0 || deleted === recordIds.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (deleted / elapsed).toFixed(1);
      log(`   Deleted ${deleted}/${recordIds.length} (${rate}/sec)...`);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  log(`   ✅ Deleted: ${deleted} in ${totalTime.toFixed(1)}s`);
  log(`   ❌ Failed: ${failed}\n`);

  return { deleted, failed };
}

/**
 * Main execution
 */
async function main() {
  const report = {
    timestamp,
    backup_directory: backupDir,
    backup: {},
    deletion: {},
    verification: {},
    errors: []
  };

  try {
    log('🚀 Starting Attio Streaming Backup & Cleanup...\n');
    log('=' . repeat(60));

    // STEP 1: Stream backup people
    const peopleBackup = await streamBackupRecords('people', 'People', 'people_backup.json');
    report.backup.people = peopleBackup.stats;

    // STEP 2: Stream backup messages
    const messagesBackup = await streamBackupRecords('linkedin_messages', 'LinkedIn Messages', 'messages_backup.json');
    report.backup.messages = messagesBackup.stats;

    // STEP 3: Get object IDs
    const objectIds = await getObjectIds();

    // STEP 4: Summary and confirmation
    log('=' . repeat(60));
    log('\n📊 BACKUP COMPLETE - Summary:');
    log(`   People: ${peopleBackup.totalRecords} records`);
    log(`   Messages: ${messagesBackup.totalRecords} records`);
    log(`   Total backup size: ${(fs.statSync(path.join(backupDir, 'people_backup.json')).size / 1024 / 1024).toFixed(2)} MB`);
    log(`\n💾 Backup saved to: ${backupDir}\n`);

    log('⚠️  WARNING: About to DELETE all records from Attio!');
    log(`   - ${peopleBackup.totalRecords} People`);
    log(`   - ${messagesBackup.totalRecords} LinkedIn Messages`);
    log('\n   Waiting 10 seconds for cancellation (Ctrl+C)...\n');

    await new Promise(resolve => setTimeout(resolve, 10000));

    // STEP 5: Load record IDs from backup files for deletion
    log('📋 Loading record IDs for deletion...');

    const peopleData = JSON.parse(fs.readFileSync(path.join(backupDir, 'people_backup.json'), 'utf8'));
    const messagesData = JSON.parse(fs.readFileSync(path.join(backupDir, 'messages_backup.json'), 'utf8'));

    const peopleIds = peopleData.map(p => p.id?.record_id).filter(Boolean);
    const messageIds = messagesData.map(m => m.id?.record_id).filter(Boolean);

    log(`   People IDs: ${peopleIds.length}`);
    log(`   Message IDs: ${messageIds.length}\n`);

    // STEP 6: Delete messages first (avoid orphaned references)
    const msgDeletion = await deleteRecordsBatch(objectIds.messages, 'LinkedIn Messages', messageIds);
    report.deletion.messages = msgDeletion;

    // STEP 7: Delete people
    const peopleDeletion = await deleteRecordsBatch(objectIds.people, 'People', peopleIds);
    report.deletion.people = peopleDeletion;

    // STEP 8: Verify deletion
    log('🔍 Verifying deletion...');

    const verifyPeople = await axiosClient.post(
      `${AT_API_BASE}/v2/objects/people/records/query`,
      { limit: 1 },
      { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
    );

    const verifyMessages = await axiosClient.post(
      `${AT_API_BASE}/v2/objects/linkedin_messages/records/query`,
      { limit: 1 },
      { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
    );

    const remainingPeople = verifyPeople.data?.data?.length || 0;
    const remainingMessages = verifyMessages.data?.data?.length || 0;

    report.verification = {
      remaining_people: remainingPeople,
      remaining_messages: remainingMessages,
      clean: remainingPeople === 0 && remainingMessages === 0
    };

    log(`   Remaining people: ${remainingPeople}`);
    log(`   Remaining messages: ${remainingMessages}\n`);

    // STEP 9: Generate final report
    report.success = report.verification.clean;
    report.completed_at = new Date().toISOString();

    fs.writeFileSync(
      path.join(backupDir, 'cleanup_report.json'),
      JSON.stringify(report, null, 2)
    );

    log('=' . repeat(60));
    log('\n✅ CLEANUP COMPLETE!\n');
    log('📊 Final Summary:');
    log(`   Backed up: ${peopleBackup.totalRecords} people, ${messagesBackup.totalRecords} messages`);
    log(`   Deleted: ${peopleDeletion.deleted} people, ${msgDeletion.deleted} messages`);
    log(`   Status: ${report.verification.clean ? '✅ CLEAN' : '⚠️  INCOMPLETE'}`);
    log(`\n📁 Full report: ${path.join(backupDir, 'cleanup_report.json')}`);

    if (!report.verification.clean) {
      log('\n⚠️  WARNING: Some records remain. Check cleanup_report.json for details.');
    }

  } catch (error) {
    log(`\n❌ FATAL ERROR: ${error.message}`);
    log(error.stack);

    report.errors.push({
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(
      path.join(backupDir, 'cleanup_report.json'),
      JSON.stringify(report, null, 2)
    );

    process.exit(1);
  }
}

// Execute
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
