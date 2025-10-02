#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

const ATTIO_API_KEY = process.env.ATTIO_API_KEY;
const AT_API_BASE = 'https://api.attio.com';
const PEOPLE_OBJECT_ID = '954fd52e-3738-4e4f-adc9-537f439508e3';

const axiosClient = axios.create({
  timeout: 120000,
  headers: { 'User-Agent': 'Attio-Cleanup/1.0' }
});

async function fetchAllRemainingPeople() {
  console.log('📥 Fetching remaining people IDs...');
  const allIds = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const resp = await axiosClient.post(
      `${AT_API_BASE}/v2/objects/people/records/query`,
      { limit, offset },
      { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
    );

    const records = resp.data?.data || [];
    if (records.length === 0) break;

    const ids = records.map(r => r.id?.record_id).filter(Boolean);
    allIds.push(...ids);
    console.log(`   Fetched ${allIds.length} IDs...`);

    if (records.length < limit) break;
    offset += limit;
  }

  console.log(`   ✅ Total remaining: ${allIds.length}\n`);
  return allIds;
}

async function deletePeopleBatch(peopleIds) {
  console.log(`🗑️  Deleting ${peopleIds.length} people...\n`);

  let deleted = 0;
  let failed = 0;
  const batchSize = 10;
  const startTime = Date.now();

  for (let i = 0; i < peopleIds.length; i += batchSize) {
    const batch = peopleIds.slice(i, i + batchSize);

    const deletePromises = batch.map(recordId =>
      axiosClient.delete(
        `${AT_API_BASE}/v2/objects/${PEOPLE_OBJECT_ID}/records/${recordId}`,
        { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
      ).then(() => ({ success: true }))
        .catch(e => ({ success: false, error: e.message }))
    );

    const results = await Promise.all(deletePromises);

    deleted += results.filter(r => r.success).length;
    failed += results.filter(r => !r.success).length;

    if (deleted % 100 === 0 || deleted === peopleIds.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (deleted / elapsed).toFixed(1);
      console.log(`   Deleted ${deleted}/${peopleIds.length} (${rate}/sec)...`);
    }
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`\n   ✅ Deleted: ${deleted} in ${totalTime.toFixed(1)}s`);
  console.log(`   ❌ Failed: ${failed}\n`);

  return { deleted, failed };
}

async function main() {
  try {
    const peopleIds = await fetchAllRemainingPeople();

    if (peopleIds.length === 0) {
      console.log('✅ No people remaining - cleanup complete!');
      return;
    }

    const result = await deletePeopleBatch(peopleIds);

    // Verify
    console.log('🔍 Verifying deletion...');
    const verifyResp = await axiosClient.post(
      `${AT_API_BASE}/v2/objects/people/records/query`,
      { limit: 1 },
      { headers: { Authorization: `Bearer ${ATTIO_API_KEY}` } }
    );

    const remaining = verifyResp.data?.data?.length || 0;
    console.log(`   Remaining people: ${remaining}\n`);

    if (remaining === 0) {
      console.log('✅ CLEANUP COMPLETE - All people deleted!');
    } else {
      console.log(`⚠️  WARNING: ${remaining} people still remain`);
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
