#!/usr/bin/env node

/**
 * Scheduler for HeyReach → Attio Sync
 *
 * Sets up automated sync jobs on various schedules.
 * Can be run as a service or added to system cron/Task Scheduler.
 *
 * Usage:
 *   node scheduler.js              # Run continuous scheduler
 *   node scheduler.js --once       # Run single sync and exit
 *   node scheduler.js --check      # Check sync health status
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const SYNC_INTERVAL_HOURS = parseInt(process.env.SYNC_INTERVAL_HOURS || '6', 10);
const FULL_SYNC_INTERVAL_DAYS = parseInt(process.env.FULL_SYNC_INTERVAL_DAYS || '7', 10);
const HEALTH_CHECK_INTERVAL_MINUTES = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30', 10);
const LOG_DIR = process.env.LOG_DIR || path.join('logs', 'scheduler');
const STATE_FILE = path.join('.sync', 'scheduler_state.json');

class SyncScheduler {
  constructor() {
    this.state = this.loadState();
    this.ensureDirectories();
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed to load scheduler state:', e.message);
    }
    return {
      last_delta_sync: null,
      last_full_sync: null,
      last_health_check: null,
      sync_history: [],
      failures: []
    };
  }

  saveState() {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save scheduler state:', e.message);
    }
  }

  ensureDirectories() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  async runSync(mode = 'delta') {
    const timestamp = new Date().toISOString();
    const logFile = path.join(LOG_DIR, `sync-${mode}-${timestamp.replace(/[:.]/g, '-')}.log`);

    console.log(`\n🔄 Starting ${mode} sync at ${timestamp}`);
    console.log(`   Log file: ${logFile}`);

    return new Promise((resolve, reject) => {
      const command = mode === 'full'
        ? 'npm run heyreach:sync:full'
        : 'npm run heyreach:sync:delta';

      const startTime = Date.now();
      const process = exec(command, { maxBuffer: 10 * 1024 * 1024 });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data) => {
        output += data;
        console.log(data.toString().trim());
      });

      process.stderr.on('data', (data) => {
        errorOutput += data;
        console.error(data.toString().trim());
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;

        // Write log file
        const logContent = [
          `Sync Type: ${mode}`,
          `Started: ${timestamp}`,
          `Completed: ${new Date().toISOString()}`,
          `Duration: ${Math.round(duration / 1000)}s`,
          `Exit Code: ${code}`,
          `Success: ${success}`,
          '\n--- Output ---',
          output,
          '\n--- Errors ---',
          errorOutput
        ].join('\n');

        fs.writeFileSync(logFile, logContent, 'utf8');

        // Update state
        const syncRecord = {
          timestamp,
          mode,
          duration,
          success,
          logFile
        };

        this.state.sync_history.push(syncRecord);
        if (this.state.sync_history.length > 100) {
          this.state.sync_history = this.state.sync_history.slice(-100);
        }

        if (success) {
          if (mode === 'full') {
            this.state.last_full_sync = timestamp;
          } else {
            this.state.last_delta_sync = timestamp;
          }
        } else {
          this.state.failures.push(syncRecord);
          if (this.state.failures.length > 20) {
            this.state.failures = this.state.failures.slice(-20);
          }
        }

        this.saveState();

        if (success) {
          console.log(`✅ ${mode} sync completed successfully in ${Math.round(duration / 1000)}s`);
          resolve(syncRecord);
        } else {
          console.error(`❌ ${mode} sync failed with code ${code}`);
          reject(new Error(`Sync failed with code ${code}`));
        }
      });
    });
  }

  async checkHealth() {
    const reportPath = path.join('exports', 'attio', 'sync-report-delta.json');

    try {
      if (!fs.existsSync(reportPath)) {
        return { healthy: false, reason: 'No sync report found' };
      }

      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      const reportAge = Date.now() - new Date(report.timestamp).getTime();
      const ageHours = reportAge / (1000 * 60 * 60);

      // Health checks
      const checks = {
        age: ageHours < SYNC_INTERVAL_HOURS * 2,
        errors: report.statistics.errors.length === 0,
        success_rate: (report.statistics.leads_processed > 0 &&
                      report.statistics.leads_processed > report.statistics.errors.length)
      };

      const healthy = Object.values(checks).every(v => v);

      return {
        healthy,
        checks,
        last_sync: report.timestamp,
        age_hours: Math.round(ageHours * 10) / 10,
        stats: report.statistics
      };
    } catch (e) {
      return { healthy: false, reason: e.message };
    }
  }

  shouldRunDeltaSync() {
    if (!this.state.last_delta_sync) return true;

    const elapsed = Date.now() - new Date(this.state.last_delta_sync).getTime();
    const elapsedHours = elapsed / (1000 * 60 * 60);

    return elapsedHours >= SYNC_INTERVAL_HOURS;
  }

  shouldRunFullSync() {
    if (!this.state.last_full_sync) return true;

    const elapsed = Date.now() - new Date(this.state.last_full_sync).getTime();
    const elapsedDays = elapsed / (1000 * 60 * 60 * 24);

    return elapsedDays >= FULL_SYNC_INTERVAL_DAYS;
  }

  async runScheduledSync() {
    try {
      // Check if full sync is needed
      if (this.shouldRunFullSync()) {
        await this.runSync('full');
        return;
      }

      // Otherwise run delta sync if needed
      if (this.shouldRunDeltaSync()) {
        await this.runSync('delta');
      } else {
        console.log('⏰ No sync needed at this time');
        console.log(`   Next delta sync in ${this.getTimeUntilNextSync()} hours`);
      }
    } catch (err) {
      console.error('Sync failed:', err.message);

      // If delta sync fails, try full sync as fallback
      if (this.state.failures.length > 2) {
        console.log('Multiple failures detected, attempting full sync...');
        try {
          await this.runSync('full');
        } catch (fullErr) {
          console.error('Full sync also failed:', fullErr.message);
        }
      }
    }
  }

  getTimeUntilNextSync() {
    if (!this.state.last_delta_sync) return 0;

    const elapsed = Date.now() - new Date(this.state.last_delta_sync).getTime();
    const elapsedHours = elapsed / (1000 * 60 * 60);
    const remaining = SYNC_INTERVAL_HOURS - elapsedHours;

    return Math.max(0, Math.round(remaining * 10) / 10);
  }

  async startContinuousScheduler() {
    console.log('🚀 Starting HeyReach → Attio Sync Scheduler');
    console.log(`   Delta sync interval: ${SYNC_INTERVAL_HOURS} hours`);
    console.log(`   Full sync interval: ${FULL_SYNC_INTERVAL_DAYS} days`);
    console.log(`   Health check interval: ${HEALTH_CHECK_INTERVAL_MINUTES} minutes`);

    // Run initial sync
    await this.runScheduledSync();

    // Set up intervals
    setInterval(async () => {
      await this.runScheduledSync();
    }, SYNC_INTERVAL_HOURS * 60 * 60 * 1000);

    // Health checks
    setInterval(async () => {
      const health = await this.checkHealth();
      if (!health.healthy) {
        console.warn('⚠️ Health check failed:', health);
        // Could send alert here (email, Slack, etc.)
      }
    }, HEALTH_CHECK_INTERVAL_MINUTES * 60 * 1000);

    console.log('📡 Scheduler running. Press Ctrl+C to stop.');
  }

  printStatus() {
    console.log('\n📊 Sync Scheduler Status');
    console.log('══════════════════════════');

    if (this.state.last_delta_sync) {
      const age = (Date.now() - new Date(this.state.last_delta_sync).getTime()) / (1000 * 60 * 60);
      console.log(`Last Delta Sync: ${this.state.last_delta_sync} (${Math.round(age)} hours ago)`);
    } else {
      console.log('Last Delta Sync: Never');
    }

    if (this.state.last_full_sync) {
      const age = (Date.now() - new Date(this.state.last_full_sync).getTime()) / (1000 * 60 * 60 * 24);
      console.log(`Last Full Sync: ${this.state.last_full_sync} (${Math.round(age)} days ago)`);
    } else {
      console.log('Last Full Sync: Never');
    }

    console.log(`\nSync History: ${this.state.sync_history.length} records`);
    console.log(`Recent Failures: ${this.state.failures.length}`);

    // Show recent syncs
    const recent = this.state.sync_history.slice(-5);
    if (recent.length > 0) {
      console.log('\nRecent Syncs:');
      recent.forEach(sync => {
        const status = sync.success ? '✅' : '❌';
        console.log(`  ${status} ${sync.timestamp} - ${sync.mode} (${Math.round(sync.duration / 1000)}s)`);
      });
    }

    console.log(`\nNext Delta Sync: In ${this.getTimeUntilNextSync()} hours`);
  }
}

// Main execution
async function main() {
  const scheduler = new SyncScheduler();
  const args = process.argv.slice(2);

  if (args.includes('--once')) {
    // Run single sync
    const mode = args.includes('--full') ? 'full' : 'delta';
    await scheduler.runSync(mode);
  } else if (args.includes('--check')) {
    // Check health status
    const health = await scheduler.checkHealth();
    console.log('\n🏥 Health Check Results:');
    console.log(JSON.stringify(health, null, 2));
    process.exit(health.healthy ? 0 : 1);
  } else if (args.includes('--status')) {
    // Show status
    scheduler.printStatus();
  } else {
    // Run continuous scheduler
    await scheduler.startContinuousScheduler();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Scheduler shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Scheduler terminated');
  process.exit(0);
});

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal scheduler error:', err);
    process.exit(1);
  });
}

module.exports = SyncScheduler;