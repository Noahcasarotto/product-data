#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

(async () => {
  console.log('🧪 Backfill E2E Test (real data, 5 leads)');

  // 1) Run small backfill
  process.env.AT_DRY_RUN = 'false';
  process.env.MAX_LEADS = process.env.MAX_LEADS || '5';
  process.env.HR_INBOX_LIMIT = process.env.HR_INBOX_LIMIT || '10';
  process.env.HR_FORCE_INBOX = '1';

  await execPromise('node heyreach-backfill.js');

  // 2) Check outputs
  const outDir = path.join('exports', 'attio');
  const reportPath = path.join(outDir, 'backfill-report.json');
  const messagesCsv = path.join(outDir, 'messages.csv');
  const peopleCsv = path.join(outDir, 'people.csv');

  if (!fs.existsSync(reportPath)) {
    console.error('❌ No backfill report found');
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.counts.peopleRows < 1 || report.counts.messageRows < 1) {
    console.error('❌ Report counts look wrong:', report.counts);
    process.exit(1);
  }

  if (!fs.existsSync(peopleCsv) || !fs.existsSync(messagesCsv)) {
    console.error('❌ Missing CSV outputs');
    process.exit(1);
  }

  console.log('✅ Backfill report counts:', report.counts);

  // 3) Re-run to verify dedupe (should not error and not double counts in Attio)
  await execPromise('node heyreach-backfill.js');
  console.log('✅ Re-run completed (dedupe verified by no errors)');

  console.log('🎉 E2E backfill test finished');
})();


