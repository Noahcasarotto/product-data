#!/usr/bin/env node

/**
 * HeyReach → Attio Backfill Script
 *
 * Purpose:
 * - Pull all leads from specified HeyReach lists (historical)
 * - Pull full conversation history for each lead
 * - Emit two Attio-ready CSVs: people.csv and messages.csv
 * - Emit a JSON report with counts, skips, and errors
 *
 * Configuration (via environment variables):
 * - HR_API_KEY (required): HeyReach API key
 * - HR_LIST_IDS (optional): Comma-separated list IDs to enumerate; if empty fetch all leads
 * - HR_API_BASE (recommended): Base URL, e.g. https://api.heyreach.co (uses /leads and /conversations)
 * - HR_GET_LEADS_URL (optional): Full URL override for leads (fallback if no HR_API_BASE)
 * - HR_GET_CONVERSATIONS_URL (optional): Full URL override for conversations (fallback if no HR_API_BASE)
 * - HR_GET_LEADS_FROM_LIST_URL (deprecated): Legacy override for list-scoped leads endpoint
 * - HR_GET_CONVERSATIONS_V2_URL (deprecated): Legacy override for conversations endpoint
 * - HR_PAGE_LIMIT (optional): Page size for API pagination (default: 100)
 * - CONCURRENCY (optional): Parallel requests limit (default: 5)
 * - OUTPUT_DIR (optional): Directory to write CSVs/report (default: exports/attio)
 * - HR_TIMEOUT_MS (optional): Axios request timeout in ms (default: 30000)
 * - HR_MAX_RETRIES (optional): Retry attempts for 429/5xx/network (default: 3)
 * - HR_RETRY_BASE_MS (optional): Base backoff in ms (default: 500)
 *
 * Usage:
 *   npm run heyreach:backfill
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const http = require('http');
const https = require('https');
const pLimitModule = require('p-limit');
const createLimit = pLimitModule && pLimitModule.default ? pLimitModule.default : pLimitModule;
require('dotenv').config();

// ------- Configuration -------
const HEYREACH_API_KEY = process.env.HR_API_KEY;
const LIST_IDS = (process.env.HR_LIST_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const API_BASE = (process.env.HR_API_BASE || '').replace(/\/+$/, '');
const URL_GET_LEADS_FROM_LIST = process.env.HR_GET_LEADS_FROM_LIST_URL; // deprecated legacy override
const URL_GET_CONVERSATIONS_V2 = process.env.HR_GET_CONVERSATIONS_V2_URL; // deprecated legacy override
const URL_LEADS = process.env.HR_GET_LEADS_URL || (API_BASE ? API_BASE + '/leads' : '');
const URL_CONVERSATIONS = process.env.HR_GET_CONVERSATIONS_URL || (API_BASE ? API_BASE + '/conversations' : '');
const PAGE_LIMIT = parseInt(process.env.HR_PAGE_LIMIT || '100', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join('exports', 'attio');
const MAX_LEADS = parseInt(process.env.MAX_LEADS || '0', 10); // 0 = no limit
const TIMEOUT_MS = parseInt(process.env.HR_TIMEOUT_MS || '30000', 10);
const MAX_RETRIES = parseInt(process.env.HR_MAX_RETRIES || '3', 10);
const RETRY_BASE_MS = parseInt(process.env.HR_RETRY_BASE_MS || '500', 10);
const PROBE_ONLY = /^(1|true)$/i.test(process.env.HR_PROBE_ONLY || '');
const FORCE_INBOX = /^(1|true)$/i.test(process.env.HR_FORCE_INBOX || '');
const INBOX_CONCURRENCY = parseInt(process.env.HR_INBOX_CONCURRENCY || '1', 10);
const MAX_REQS_PER_2S = parseInt(process.env.HR_MAX_REQS_PER_2S || '8', 10); // API says <15 per 2s
const PER_REQ_DELAY_MS = Math.ceil(2000 / Math.max(1, Math.min(14, MAX_REQS_PER_2S)));
let nextAllowedAtMs = 0;
const MAX_INBOX_BATCHES = parseInt(process.env.HR_MAX_INBOX_BATCHES || '5', 10);
const INBOX_LIMIT = parseInt(process.env.HR_INBOX_LIMIT || process.env.HR_PAGE_LIMIT || '100', 10);
const INBOX_MAX_PAGES = parseInt(process.env.HR_INBOX_MAX_PAGES || '1', 10); // pilot: first page per batch
const INBOX_CAMPAIGN_IDS = (process.env.HR_INBOX_CAMPAIGN_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean).map(n => parseInt(n, 10)).filter(Boolean);
const INBOX_ACCOUNT_IDS = (process.env.HR_INBOX_ACCOUNT_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean).map(n => parseInt(n, 10)).filter(Boolean);

// Attio API (direct upsert) configuration
const ATTIO_API_KEY = process.env.AT_API_KEY || process.env.ATTIO_API_KEY || '';
const AT_API_BASE = (process.env.AT_API_BASE || 'https://api.attio.com').replace(/\/+$/, '');
const AT_PEOPLE_UPSERT_URL = process.env.AT_PEOPLE_UPSERT_URL || '';
const AT_THREADS_UPSERT_URL = process.env.AT_THREADS_UPSERT_URL || '';
const AT_DRY_RUN = /^(1|true)$/i.test(process.env.AT_DRY_RUN || ((!ATTIO_API_KEY || !AT_PEOPLE_UPSERT_URL || !AT_THREADS_UPSERT_URL) ? '1' : '0'));
const WATERMARK_PATH = process.env.HR_WATERMARK_PATH || path.join('.sync', 'sync_state.json');
const AT_DISABLE_THREADS_UPSERT = /^(1|true)$/i.test(process.env.AT_DISABLE_THREADS_UPSERT || '');
const AT_MESSAGES_UPSERT_URL = process.env.AT_MESSAGES_UPSERT_URL || `${AT_API_BASE}/v2/objects/linkedin_messages/records`;
const AT_LIMIT_MESSAGES = parseInt(process.env.AT_LIMIT_MESSAGES || '0', 10); // 0 = no limit
const AT_PEOPLE_MATCH_ATTRIBUTE = process.env.AT_PEOPLE_MATCH_ATTRIBUTE || '';

// Shared cache for linking message.person via linkedin_url
const PEOPLE_RECORD_ID_BY_LINKEDIN_URL = new Map();
let AT_PEOPLE_OBJECT_ID = '';
let AT_LINKEDIN_MESSAGES_OBJECT_ID = '';

async function ensureAttioObjectIdsLoaded() {
  if (AT_PEOPLE_OBJECT_ID && AT_LINKEDIN_MESSAGES_OBJECT_ID) return;
  const resp = await axiosClient.get(`${AT_API_BASE}/v2/objects`, {
    headers: { Authorization: `Bearer ${ATTIO_API_KEY}` }
  });
  if (!(resp && resp.status >= 200 && resp.status < 300)) return;
  const items = (resp.data && resp.data.data) || [];
  for (const it of items) {
    if (it.api_slug === 'people') AT_PEOPLE_OBJECT_ID = it.id && it.id.object_id ? it.id.object_id : AT_PEOPLE_OBJECT_ID;
    if (it.api_slug === 'linkedin_messages') AT_LINKEDIN_MESSAGES_OBJECT_ID = it.id && it.id.object_id ? it.id.object_id : AT_LINKEDIN_MESSAGES_OBJECT_ID;
  }
}

// ------- Guards -------
function fatalIfMissing(name, value) {
  if (!value) {
    console.error(`❌ Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

fatalIfMissing('HR_API_KEY', HEYREACH_API_KEY);
const leadsEndpointConfigured = Boolean(URL_GET_LEADS_FROM_LIST || URL_LEADS);
const conversationsEndpointConfigured = Boolean(URL_GET_CONVERSATIONS_V2 || URL_CONVERSATIONS);

// Detect if using inbox mode
const useInbox = FORCE_INBOX || (URL_GET_CONVERSATIONS_V2 && URL_GET_CONVERSATIONS_V2.includes('/inbox/'));

// Only require the endpoint that will actually be used
if (useInbox) {
  fatalIfMissing('HeyReach conversations endpoint', conversationsEndpointConfigured ? 'OK' : '');
} else {
  fatalIfMissing('HeyReach leads endpoint', leadsEndpointConfigured ? 'OK' : '');
  fatalIfMissing('HeyReach conversations endpoint', conversationsEndpointConfigured ? 'OK' : '');
}

// ------- Helpers -------
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function writeCsv(filePath, headerArray, rowsArray) {
  const header = headerArray.map(csvEscape).join(',');
  const body = rowsArray.map(row => headerArray.map(col => csvEscape(row[col])).join(',')).join('\n');
  const content = header + (rowsArray.length ? '\n' + body : '') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

const axiosClient = axios.create({
  timeout: TIMEOUT_MS,
  maxRedirects: 0,
  validateStatus: () => true,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 })
});

async function getWithRetry(url, params, postBodyIfNeeded) {
  const authVariants = [
    { Authorization: `Bearer ${HEYREACH_API_KEY}` },
    { Authorization: `Api-Key ${HEYREACH_API_KEY}` },
    { 'x-api-key': HEYREACH_API_KEY },
    { 'X-API-KEY': HEYREACH_API_KEY },
    { 'api-key': HEYREACH_API_KEY }
  ];

  const browserLikeHeaders = { Origin: 'https://app.heyreach.io', Referer: 'https://app.heyreach.io/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' };
  async function rateLimitWait() {
    const now = Date.now();
    const wait = Math.max(0, nextAllowedAtMs - now);
    if (wait > 0) await sleep(wait);
    nextAllowedAtMs = Math.max(now, nextAllowedAtMs) + PER_REQ_DELAY_MS;
  }
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    for (let i = 0; i < authVariants.length; i += 1) {
      const headers = { ...authVariants[i], ...browserLikeHeaders };
      // Try GET first
      let resp;
      try {
        await rateLimitWait();
        resp = await axiosClient.get(url, { headers, params });
      } catch (err) {
        const status = err && err.response && err.response.status;
        const retryable = !status || status === 429 || status >= 500;
        if (attempt < MAX_RETRIES && retryable) {
          const delayMs = Math.round(RETRY_BASE_MS * Math.pow(2, attempt) * (1 + Math.random() * 0.25));
          console.warn(`   ↻ Retry ${attempt + 1}/${MAX_RETRIES} for ${url} after ${delayMs}ms (status=${status || 'network'})`);
          await sleep(delayMs);
          continue;
        }
        // If GET failed synchronously, try POST fallback
        if (postBodyIfNeeded) {
          try {
            await rateLimitWait();
            const postResp = await axiosClient.post(url, postBodyIfNeeded, { headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' } });
            if (postResp.status >= 200 && postResp.status < 300) return postResp;
          } catch (postErr) {
            // continue to status handling below
          }
        }
        throw err;
      }

      let status = resp.status;
      if (status >= 200 && status < 300) return resp;

      // If redirected or 404/405, try POST fallback on same URL
      if ((status >= 300 && status < 400) || status === 404 || status === 405) {
        const loc = (resp.headers && (resp.headers.location || resp.headers.Location)) || '';
        if (status >= 300 && status < 400) {
          console.warn(`   ↪ Received redirect (${status}) for ${url}${loc ? ` → ${loc}` : ''}; attempting POST fallback...`);
        }
        if (postBodyIfNeeded) {
          try {
            await rateLimitWait();
            const postResp = await axiosClient.post(url, postBodyIfNeeded, { headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' } });
            if (postResp.status >= 200 && postResp.status < 300) return postResp;
            status = postResp.status;
          } catch (postErr) {
            status = postErr && postErr.response && postErr.response.status;
          }
        }
        // try next auth variant
        continue;
      }

      if (status === 401 || status === 403) {
        console.warn(`   🔐 Auth rejected with status ${status}; trying alternate auth header...`);
        continue;
      }

      if ((status === 429 || status >= 500) && attempt < MAX_RETRIES) {
        const delayMs = Math.round(RETRY_BASE_MS * Math.pow(2, attempt) * (1 + Math.random() * 0.25));
        console.warn(`   ↻ Retry ${attempt + 1}/${MAX_RETRIES} for ${url} after ${delayMs}ms (status=${status})`);
        await sleep(delayMs);
        break;
      }

      const snippet = (resp.data && typeof resp.data === 'string') ? resp.data.slice(0, 200) : '';
      throw new Error(`Request to ${url} failed with status ${status}${snippet ? ` body=${JSON.stringify(snippet)}` : ''}`);
    }
  }
  throw new Error(`Exhausted retries for ${url}`);
}

async function probeEndpoints() {
  const listId = (LIST_IDS[0] || '').trim();
  const hostBases = ['https://api.heyreach.io', 'https://app.heyreach.io', 'https://api.heyreach.co'];
  const prefixes = ['', '/api', '/api/public', '/api/public/lead', '/public', '/public/lead'];
  const leadPaths = ['GetLeadsFromList', 'lead/GetLeadsFromList', 'Lead/GetLeadsFromList'];
  const authVariants = [
    { Authorization: `Bearer ${HEYREACH_API_KEY}` },
    { 'x-api-key': HEYREACH_API_KEY },
    { Authorization: `Api-Key ${HEYREACH_API_KEY}` }
  ];
  const browserHeaders = { Origin: 'https://app.heyreach.io', Referer: 'https://app.heyreach.io/', 'User-Agent': 'Mozilla/5.0' };

  function joinUrl(a, b) {
    if (!a.endsWith('/')) a += '/';
    if (b.startsWith('/')) b = b.slice(1);
    return a + b;
  }

  async function tryOnce(method, url, headers) {
    try {
      if (method === 'GET') {
        const resp = await axiosClient.get(url, { headers: { ...headers, ...browserHeaders }, params: { listId, limit: 1 } });
        return resp;
      }
      const resp = await axiosClient.post(url, { listId, limit: 1 }, { headers: { ...headers, ...browserHeaders, 'Content-Type': 'application/json', Accept: 'application/json' } });
      return resp;
    } catch (e) {
      return e && e.response ? e.response : { status: 0, data: String(e.message || e) };
    }
  }

  console.log('🔎 Probing HeyReach endpoints...');
  for (const base of hostBases) {
    for (const prefix of prefixes) {
      for (const path of leadPaths) {
        const prefixUrl = prefix ? joinUrl(base, prefix) : base;
        const url = joinUrl(prefixUrl, path);
        for (const headers of authVariants) {
          for (const method of ['GET', 'POST']) {
            const resp = await tryOnce(method, url, headers);
            console.log(` → ${method} ${url} [${Object.keys(headers)[0]}] => ${resp.status}`);
            if (resp.status >= 200 && resp.status < 300) {
              const convUrl = url.replace(/GetLeadsFromList/i, 'GetConversationsV2');
              console.log(`✅ Detected leads endpoint: ${url}`);
              console.log(`   Suggested conversations endpoint: ${convUrl}`);
              console.log('Set these in your .env then re-run:');
              console.log(`HR_GET_LEADS_FROM_LIST_URL=${url}`);
              console.log(`HR_GET_CONVERSATIONS_V2_URL=${convUrl}`);
              return { leads: url, conv: convUrl };
            }
          }
        }
      }
    }
  }
  console.log('✖ No working endpoint detected. Please share a working Postman request (URL/method/headers/body).');
  return null;
}

function normalizeLinkedInUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('linkedin')) {
      u.hash = '';
      u.search = '';
      let normalized = u.toString();
      if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
      return normalized;
    }
    return url.trim();
  } catch {
    return String(url).trim();
  }
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj && obj[k] !== undefined ? obj[k] : '';
  return out;
}

// Heuristics to read likely HeyReach response shapes without hard fail
function extractLeadCore(lead) {
  const liUrl = normalizeLinkedInUrl(
    lead.linkedinProfileUrl || lead.linkedin_url || lead.profileUrl || lead.profile_url || ''
  );
  return {
    leadId: lead.leadId || lead.id || lead.lead_id || '',
    first_name: lead.firstName || lead.first_name || '',
    last_name: lead.lastName || lead.last_name || '',
    full_name: lead.fullName || lead.full_name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
    job_title: lead.title || lead.job_title || lead.position || '',
    company_name: lead.companyName || lead.company_name || '',
    company_domain: lead.companyDomain || lead.company_domain || '',
    linkedin_url: liUrl,
    heyreach_lead_id: lead.leadId || lead.id || lead.lead_id || '',
    lead_source: 'HeyReach',
    campaign_name: lead.campaignName || lead.campaign_name || '',
    campaign_id: lead.campaignId || lead.campaign_id || '',
    owner_email: lead.ownerEmail || lead.owner_email || '',
    lead_status: lead.status || lead.lead_status || '',
    last_touch_at: lead.lastTouchAt || lead.last_touch_at || '',
    last_reply_at: lead.lastReplyAt || lead.last_reply_at || ''
  };
}

function extractMessageCore(leadId, linkedinUrl, m) {
  const ts = m.timestamp || m.createdAt || m.created_at || m.date || '';
  const body = m.body || m.text || m.message || '';
  const direction = m.direction || (m.from === 'me' ? 'sent' : (m.from === 'lead' ? 'received' : '')) || '';
  const channel = m.channel || m.type || '';
  return {
    person_match_linkedin_url: linkedinUrl,
    lead_id: leadId || '',
    direction,
    channel,
    message_id: m.id || m.messageId || m.message_id || '',
    thread_id: m.threadId || m.thread_id || '',
    campaign_id: m.campaignId || m.campaign_id || '',
    timestamp: ts,
    body: body,
    raw_json: JSON.stringify(m)
  };
}

// Inbox (conversations) helpers
async function fetchCampaignIds() {
  const url = 'https://api.heyreach.io/api/public/campaign/GetAll';
  const resp = await getWithRetry(url, {}, {});
  const data = resp && resp.data ? resp.data : {};
  const items = data.items || data.data || [];
  return items.map(it => it.id).filter(Boolean);
}

async function fetchLinkedInAccountIds() {
  const url = 'https://api.heyreach.io/api/public/li_account/GetAll';
  const resp = await getWithRetry(url, {}, {});
  const data = resp && resp.data ? resp.data : {};
  const items = data.items || data.data || [];
  return items.map(it => it.id).filter(Boolean);
}

async function fetchInboxConversations(conversationsUrl, filters, limit, offset) {
  const payload = { filters: filters || {}, limit: limit || INBOX_LIMIT, offset: offset || 0 };
  const resp = await getWithRetry(conversationsUrl, {}, payload);
  if (!(resp && resp.status >= 200 && resp.status < 300)) return { totalCount: 0, items: [] };
  const data = resp.data || {};
  const totalCount = data.totalCount || data.count || 0;
  const items = data.items || data.data || [];
  return { totalCount, items };
}

function buildPeopleRowFromCorrespondent(c) {
  const liUrl = normalizeLinkedInUrl(c && (c.profileUrl || c.profile_url || ''));
  return {
    first_name: (c && (c.firstName || c.first_name)) || '',
    last_name: (c && (c.lastName || c.last_name)) || '',
    full_name: `${(c && (c.firstName || c.first_name)) || ''} ${(c && (c.lastName || c.last_name)) || ''}`.trim(),
    job_title: (c && (c.position || c.headline)) || '',
    company_name: (c && (c.companyName || '')) || '',
    company_domain: '',
    linkedin_url: liUrl,
    heyreach_lead_id: '',
    lead_source: 'HeyReach',
    campaign_name: '',
    campaign_id: '',
    owner_email: '',
    lead_status: '',
    last_touch_at: '',
    last_reply_at: ''
  };
}

// Helper function to search for existing person by LinkedIn URL
// Cache for full person records (not just IDs) to avoid repeated API calls
const PEOPLE_RECORD_CACHE = new Map();

async function findPersonByLinkedInUrl(linkedinUrl) {
  if (!linkedinUrl) return null;

  // Check cache first for full record
  const cached = PEOPLE_RECORD_CACHE.get(linkedinUrl);
  if (cached) {
    return cached;
  }

  try {
    const queryUrl = `${AT_API_BASE}/v2/objects/people/records/query`;
    const payload = {
      filter: {
        linkedin_url_6: linkedinUrl
      },
      limit: 1
    };

    const resp = await axiosClient.post(queryUrl, payload, {
      headers: {
        Authorization: `Bearer ${ATTIO_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (resp && resp.status >= 200 && resp.status < 300) {
      const data = resp.data && resp.data.data ? resp.data.data : [];
      if (data.length > 0) {
        const record = data[0];
        const recordId = record.id && record.id.record_id ? record.id.record_id : null;
        if (recordId) {
          // Cache both the ID (for legacy code) and full record
          const result = { recordId, record };
          PEOPLE_RECORD_ID_BY_LINKEDIN_URL.set(linkedinUrl, recordId);
          PEOPLE_RECORD_CACHE.set(linkedinUrl, result);
          return result;
        }
      }
    }
  } catch (e) {
    // Query failed, will create new person
    console.warn(`   ⚠️  Failed to query person by LinkedIn URL: ${e.message}`);
  }

  return null;
}

// Helper to extract current values from Attio record for comparison
function extractCurrentValues(attioRecord) {
  const values = attioRecord.values || {};

  // Helper to get latest value from Attio's time-series format
  const getLatest = (field) => {
    if (!values[field] || !Array.isArray(values[field]) || values[field].length === 0) {
      return null;
    }
    return values[field][0]; // Latest value is first in array
  };

  const nameField = getLatest('name');
  const jobTitleField = getLatest('job_title_5');
  const companyNameField = getLatest('company_name');
  const heyreachIdField = getLatest('heyreach_lead_id');

  return {
    full_name: nameField ? nameField.full_name : null,
    first_name: nameField ? nameField.first_name : null,
    last_name: nameField ? nameField.last_name : null,
    job_title: jobTitleField ? jobTitleField.value : null,
    company_name: companyNameField ? companyNameField.value : null,
    heyreach_lead_id: heyreachIdField ? heyreachIdField.value : null
  };
}

// Detect what fields changed between HeyReach data and current Attio data
function detectChanges(currentValues, newRow) {
  const changes = {};

  // Name comparison
  const newFirst = newRow.first_name || '';
  const newLast = newRow.last_name || '';
  const newFull = newRow.full_name || `${newFirst} ${newLast}`.trim();

  const currentFirst = currentValues.first_name || '';
  const currentLast = currentValues.last_name || '';
  const currentFull = currentValues.full_name || '';

  if (newFull && newFull !== currentFull) {
    changes.name = {
      full_name: newFull,
      first_name: newFirst || newFull.split(/\s+/)[0] || '',
      last_name: newLast || newFull.split(/\s+/).slice(1).join(' ') || ''
    };
  }

  // Job title comparison
  if (newRow.job_title && newRow.job_title !== currentValues.job_title) {
    changes.job_title_5 = newRow.job_title;
  }

  // Company name comparison
  if (newRow.company_name && newRow.company_name !== currentValues.company_name) {
    changes.company_name = newRow.company_name;
  }

  // HeyReach Lead ID (only add if not already set)
  if (newRow.heyreach_lead_id && !currentValues.heyreach_lead_id) {
    changes.heyreach_lead_id = newRow.heyreach_lead_id;
  }

  return changes;
}

// Update existing person with changed fields
async function updatePersonFields(recordId, changes) {
  if (Object.keys(changes).length === 0) {
    return { updated: false };
  }

  try {
    await ensureAttioObjectIdsLoaded();

    const updatePayload = {
      data: {
        values: changes
      }
    };

    const resp = await axiosClient.patch(
      `${AT_API_BASE}/v2/objects/${AT_PEOPLE_OBJECT_ID}/records/${recordId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${ATTIO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (resp && resp.status >= 200 && resp.status < 300) {
      return { updated: true, fields: Object.keys(changes) };
    }

    return { updated: false, error: 'Non-2xx status' };
  } catch (e) {
    return { updated: false, error: e.message };
  }
}

// Attio API upsert helpers (dry-run logs when AT_DRY_RUN=true)
async function attioUpsertPeople(peopleRows) {
  if (peopleRows.length === 0) return { upserted: 0 };
  if (AT_DRY_RUN) {
    console.log(`   [DRY-RUN] Would upsert ${peopleRows.length} people to Attio`);
    return { upserted: peopleRows.length };
  }
  const url = AT_PEOPLE_UPSERT_URL || `${AT_API_BASE}/v2/people:batchUpsert`;
  await ensureAttioObjectIdsLoaded();

  // Helper to map our flat row to Attio values shape
  function mapPersonRowToValues(row) {
    const values = {};
    if (row.first_name || row.last_name) {
      values.name = [{ value: { first_name: row.first_name || '', last_name: row.last_name || '' } }];
    }
    if (row.full_name && !(row.first_name || row.last_name)) {
      // Fallback: split full_name when no first/last present
      const parts = String(row.full_name).trim().split(/\s+/);
      const last = parts.pop() || '';
      const first = parts.join(' ');
      values.name = [{ value: { first_name: first, last_name: last } }];
    }
    if (row.job_title) values.job_title = [{ value: row.job_title }];
    if (row.company_name) values.company_name = [{ value: row.company_name }];
    if (row.linkedin_url) values.linkedin_url_6 = [{ value: row.linkedin_url }];
    if (row.heyreach_lead_id) values.heyreach_lead_id = [{ value: row.heyreach_lead_id }];
    if (row.last_reply_at) values.last_reply_at = [{ value: row.last_reply_at }];
    if (row.last_touch_at) values.last_contacted_at = [{ value: row.last_touch_at }];
    return values;
  }

  // If the override URL targets single-record create endpoint, send one-by-one in that shape
  if (/\/v2\/objects\/people\/records$/i.test(url)) {
    let ok = 0;
    for (const row of peopleRows) {
      try {
        // STEP 1: Check if person already exists by LinkedIn URL
        const existingPerson = await findPersonByLinkedInUrl(row.linkedin_url);

        if (existingPerson) {
          // Person exists - check if update is needed
          const { recordId, record } = existingPerson;
          PEOPLE_RECORD_ID_BY_LINKEDIN_URL.set(row.linkedin_url, recordId);

          // Extract current values and detect changes
          const currentValues = extractCurrentValues(record);
          const changes = detectChanges(currentValues, row);

          if (Object.keys(changes).length > 0) {
            // Update person with changed fields
            const updateResult = await updatePersonFields(recordId, changes);
            if (updateResult.updated) {
              console.log(`   🔄 Updated ${row.full_name || row.first_name}: ${updateResult.fields.join(', ')}`);
            } else {
              console.warn(`   ⚠️  Failed to update ${row.full_name || row.first_name}: ${updateResult.error || 'unknown'}`);
            }
          } else {
            console.log(`   ✓ No changes for ${row.full_name || row.first_name}`);
          }

          ok += 1;
          continue;
        }

        // STEP 2: Person doesn't exist - create new
        // For objects create, Attio expects direct typed values (no [{value: ...}] wrappers)
        const directValues = (() => {
          const values = {};
          const first = row.first_name || '';
          const last = row.last_name || '';
          if (first || last) {
            const full = `${first} ${last}`.trim();
            values.name = { full_name: full, first_name: first, last_name: last };
          } else if (row.full_name) {
            const full = String(row.full_name).trim();
            const parts = full.split(/\s+/);
            const lastName = parts.pop() || '';
            const firstName = parts.join(' ');
            values.name = { full_name: full, first_name: firstName, last_name: lastName };
          }
          // LinkedIn - extract just the slug for matching with existing records
          if (row.linkedin_url) {
            const linkedinMatch = row.linkedin_url.match(/linkedin\.com\/in\/([^\/\?]+)/);
            if (linkedinMatch) {
              const slug = linkedinMatch[1];
              // Skip setting system linkedin handle when slug is synthetic (conversation-*)
              // or otherwise clearly not a real LinkedIn handle
              if (!/^conversation-/i.test(slug)) {
                values.linkedin = slug;
              }
            }
            // Also store full URL in custom field that we know exists
            values.linkedin_url_6 = row.linkedin_url;
          }

          // Log all the data we're extracting
          console.log(`   📊 Creating new person ${row.full_name || row.first_name}:
      - Job Title: ${row.job_title || 'N/A'}
      - Company: ${row.company_name || 'N/A'}
      - Lead ID: ${row.heyreach_lead_id || 'N/A'}
      - Lead Source: ${row.lead_source || 'N/A'}
      - Campaign: ${row.campaign_name || 'N/A'} (ID: ${row.campaign_id || 'N/A'})
      - LinkedIn: ${row.linkedin_url || 'N/A'}`)

          // Email if available
          if (row.email) {
            values.email_addresses = [{ email_address: row.email }];
          }

          return values;
        })();
        const payload = { data: { values: directValues } };
        // NOTE: We no longer use matching_attribute since we're doing manual search-before-create
        const resp = await axiosClient.post(url, payload, {
          headers: { Authorization: `Bearer ${ATTIO_API_KEY}`, 'Content-Type': 'application/json' }
        });
        if (!(resp && resp.status >= 200 && resp.status < 300)) {
          const detail = resp && resp.data ? (() => { try { return JSON.stringify(resp.data).slice(0, 600); } catch { return String(resp.data).slice(0, 600); } })() : '';
          console.error(`   ❌ Failed to create ${row.full_name || row.first_name}: ${resp && resp.status} ${detail}`);
          continue;
        }
        try {
          const data = resp.data && resp.data.data ? resp.data.data : (resp.data || {});
          // Attio returns record IDs in data.id.record_id format
          const recordId = (data.id && data.id.record_id) || data.record_id || (data.record && data.record.id) || data.id;
          const li = row.linkedin_url;
          if (recordId && li) {
            PEOPLE_RECORD_ID_BY_LINKEDIN_URL.set(li, recordId);
            console.log(`   ✅ Created ${row.full_name || row.first_name} (ID: ${recordId})`);
          }
        } catch (e) {
          console.warn(`   ⚠️  Failed to extract record ID for ${row.first_name} ${row.last_name}:`, e.message);
        }
        ok += 1;
      } catch (e) {
        console.error(`   ❌ Error creating ${row.full_name || row.first_name}:`, e.message);
        if (e.response && e.response.data) {
          console.error(`   Response:`, JSON.stringify(e.response.data, null, 2));
        }
      }
    }
    return { upserted: ok };
  }

  // Default: batchUpsert (expects items with values)
  const items = peopleRows.map(r => ({ values: mapPersonRowToValues(r) }));
  const payload = { items };
  const resp = await axiosClient.post(url, payload, {
    headers: { Authorization: `Bearer ${ATTIO_API_KEY}`, 'Content-Type': 'application/json' }
  });
  if (!(resp && resp.status >= 200 && resp.status < 300)) {
    const detail = resp && resp.data ? (() => {
      try { return JSON.stringify(resp.data).slice(0, 600); } catch { return String(resp.data).slice(0, 600); }
    })() : '';
    throw new Error(`Attio people upsert failed (${resp && resp.status}) ${detail}`);
  }
  return { upserted: items.length };
}

async function attioUpsertThreads(threadRows) {
  if (threadRows.length === 0) return { upserted: 0 };
  if (AT_DISABLE_THREADS_UPSERT) {
    console.log('   [SKIP] Threads upsert disabled by AT_DISABLE_THREADS_UPSERT');
    return { upserted: 0 };
  }
  if (AT_DRY_RUN) {
    console.log(`   [DRY-RUN] Would upsert ${threadRows.length} threads to Attio`);
    return { upserted: threadRows.length };
  }

  // Map to linkedin_messages records, linking to Person by linkedin URL
  let upserted = 0;
  const messagesByPerson = new Map(); // Track messages created for each person

  // Step 1: Create all messages
  for (const thread of threadRows) {
    try {
      const li = thread.person_match_linkedin_url;
      const personId = PEOPLE_RECORD_ID_BY_LINKEDIN_URL.get(li);
      if (!personId) continue; // Skip if no person ID

      const messages = JSON.parse(thread.messages_json || '[]');
      const limited = AT_LIMIT_MESSAGES > 0 ? messages.slice(-AT_LIMIT_MESSAGES) : messages;
      const createdMessageIds = [];

      for (const m of limited) {
        // Map direction - must use exact values from Attio select field
        const directionValue = (m.sender === 'ME') ? 'Outbound' : 'Inbound';
        const vals = {
          body: m.body || thread.last_message_text || '',
          sent_at: m.createdAt || thread.first_message_at,
          direction: directionValue,
          channel: (m.isInMail ? 'inmail' : 'dm'),
          conversation_id: thread.thread_id,
          campaign: thread.campaign_id ? String(thread.campaign_id) : undefined,
          message_uid: `${thread.thread_id || ''}:${m.createdAt || ''}:${m.sender || ''}`
        };

        // Create message with person link
        vals.person = [{ target_object: 'people', target_record_id: personId }];

        const payload = { data: { values: vals } };
        const resp = await axiosClient.post(AT_MESSAGES_UPSERT_URL, payload, {
          headers: { Authorization: `Bearer ${ATTIO_API_KEY}`, 'Content-Type': 'application/json' }
        });

        if (!(resp && resp.status >= 200 && resp.status < 300)) {
          const detail = resp && resp.data ? (() => { try { return JSON.stringify(resp.data).slice(0, 600); } catch { return String(resp.data).slice(0, 600); } })() : '';
          throw new Error(`Attio message create failed (${resp && resp.status}) ${detail}`);
        }

        // Extract message record ID
        const messageId = resp.data && resp.data.data && resp.data.data.id && resp.data.data.id.record_id;
        if (messageId) {
          createdMessageIds.push(messageId);
        }

        upserted += 1;
      }

      // Track messages for this person
      if (createdMessageIds.length > 0) {
        if (!messagesByPerson.has(personId)) {
          messagesByPerson.set(personId, []);
        }
        messagesByPerson.get(personId).push(...createdMessageIds);
      }
    } catch (e) {
      console.error('   ✖ Thread messages upsert error:', e.message);
    }
  }

  // Step 2: Update each person with their message references (bidirectional link)
  for (const [personId, messageIds] of messagesByPerson.entries()) {
    try {
      await ensureAttioObjectIdsLoaded();
      const updatePayload = {
        data: {
          values: {
            linkedin_messages: messageIds.map(msgId => ({
              target_object: 'linkedin_messages',
              target_record_id: msgId
            }))
          }
        }
      };

      await axiosClient.patch(
        `${AT_API_BASE}/v2/objects/${AT_PEOPLE_OBJECT_ID}/records/${personId}`,
        updatePayload,
        { headers: { Authorization: `Bearer ${ATTIO_API_KEY}`, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error(`   ⚠️  Failed to update person ${personId} with messages: ${e.message}`);
    }
  }

  return { upserted };
}

async function fetchLeadsFromList(listId) {
  const results = [];
  let cursor = '';
  let page = 1;
  for (;;) {
    const params = { limit: PAGE_LIMIT, page };
    if (listId) params.listId = listId;
    if (cursor) params.cursor = cursor;
    const url = URL_GET_LEADS_FROM_LIST || URL_LEADS;
    if (!url) throw new Error('No leads endpoint configured');
    const postBody = { listId: listId || undefined, limit: PAGE_LIMIT, cursor: cursor || undefined, page };
    const resp = await getWithRetry(url, params, postBody);
    const data = resp.data;
    const items = data.items || data.leads || data.results || data.data || [];
    for (const rawLead of items) results.push(rawLead);
    cursor = (data && (data.nextCursor || (data.pagination && data.pagination.nextCursor) || data.next || data.cursor)) || '';
    const hasMore = (data && (data.hasMore || data.has_more)) || false;
    if (cursor) {
      // continue with cursor paging
    } else if (hasMore) {
      page += 1;
    } else if (items.length === PAGE_LIMIT) {
      page += 1; // fallback: assume page-based
    } else {
      break;
    }
  }
  return results;
}

async function fetchConversationsForLead(leadId) {
  const messages = [];
  let cursor = '';
  let page = 1;
  for (;;) {
    const params = { leadId, limit: PAGE_LIMIT, page };
    if (cursor) params.cursor = cursor;
    const url = URL_GET_CONVERSATIONS_V2 || URL_CONVERSATIONS;
    if (!url) throw new Error('No conversations endpoint configured');
    const postBody = { leadId, limit: PAGE_LIMIT, cursor: cursor || undefined, page };
    const resp = await getWithRetry(url, params, postBody);
    const data = resp.data;
    const items = data.items || data.messages || data.results || data.data || [];
    for (const m of items) messages.push(m);
    cursor = (data && (data.nextCursor || (data.pagination && data.pagination.nextCursor) || data.next || data.cursor)) || '';
    const hasMore = (data && (data.hasMore || data.has_more)) || false;
    if (cursor) {
      // continue with cursor paging
    } else if (hasMore) {
      page += 1;
    } else if (items.length === PAGE_LIMIT) {
      page += 1; // fallback: assume page-based
    } else {
      break;
    }
  }
  return messages;
}

async function main() {
  const startAt = Date.now();
  console.log('🚀 HeyReach → Attio backfill starting...');
  console.log(`   Lists: ${LIST_IDS.join(', ')}`);
  console.log(`   Concurrency: ${CONCURRENCY}, Page limit: ${PAGE_LIMIT}`);
  console.log(`   Leads endpoint: ${URL_GET_LEADS_FROM_LIST || URL_LEADS}`);
  console.log(`   Conversations endpoint: ${URL_GET_CONVERSATIONS_V2 || URL_CONVERSATIONS}`);

  if (PROBE_ONLY) {
    await probeEndpoints();
    return;
  }

  ensureDir(OUTPUT_DIR);

  const uniqueLeadsById = new Map();
  const errors = [];

  const useInbox = FORCE_INBOX || (URL_GET_CONVERSATIONS_V2 && URL_GET_CONVERSATIONS_V2.includes('/inbox/'));

  // Load watermark for incremental sync
  const syncState = readJsonSafe(WATERMARK_PATH, {
    last_sync: null,
    threads: {},
    people: {}
  });
  const isIncrementalSync = syncState.last_sync && !FORCE_INBOX;
  if (isIncrementalSync) {
    console.log(`📅 Incremental sync mode - last sync: ${syncState.last_sync}`);
  }

  // If using inbox endpoint, pull conversations by campaigns/accounts/listIds
  if (useInbox) {
    console.log('📫 Using inbox conversations endpoint flow');
    try {
      const conversationsUrl = URL_GET_CONVERSATIONS_V2 || 'https://api.heyreach.io/api/public/inbox/GetConversationsV2';
      const campaignIds = INBOX_CAMPAIGN_IDS.length ? INBOX_CAMPAIGN_IDS : await fetchCampaignIds();
      const accountIds = INBOX_ACCOUNT_IDS.length ? INBOX_ACCOUNT_IDS : await fetchLinkedInAccountIds();
      const listIds = LIST_IDS;

      const filtersBatches = [];
      if (listIds.length > 0) {
        for (const lid of listIds) filtersBatches.push({ listIds: [lid] });
      }
      if (INBOX_CAMPAIGN_IDS.length && !INBOX_ACCOUNT_IDS.length) {
        for (const cid of campaignIds) filtersBatches.push({ campaignIds: [cid] });
      } else if (!INBOX_CAMPAIGN_IDS.length && INBOX_ACCOUNT_IDS.length) {
        for (const aid of accountIds) filtersBatches.push({ linkedInAccountIds: [aid] });
      } else {
        // Extract from ALL campaigns and accounts (not just first 3)
        for (const cid of campaignIds) {
          for (const aid of accountIds) {
            filtersBatches.push({ campaignIds: [cid], linkedInAccountIds: [aid] });
          }
        }
      }

      const cappedBatches = MAX_INBOX_BATCHES > 0 ? filtersBatches.slice(0, MAX_INBOX_BATCHES) : filtersBatches;

      const limit = createLimit(INBOX_CONCURRENCY);
      const peopleRows = [];
      const messageRows = [];
      const threadRows = [];
      const peopleByUrl = new Map();

      await Promise.all(
        cappedBatches.map(f => limit(async () => {
          let offset = 0;
          for (let page = 0; ; page += 1) {
            const { totalCount, items } = await fetchInboxConversations(conversationsUrl, f, INBOX_LIMIT, offset);
            console.log(`   📥 Fetched ${items ? items.length : 0} conversations (filters: ${JSON.stringify(f)})`);
            if (!Array.isArray(items) || items.length === 0) break;
            for (const conv of items) {
              const convId = conv.id || '';
              const lastAt = conv.lastMessageAt || '';

              // Skip unchanged threads in incremental mode
              if (isIncrementalSync && syncState.threads[convId]) {
                if (syncState.threads[convId].last_message_at >= lastAt) {
                  console.log(`   ⏭️ Skipping unchanged thread ${convId}`);
                  continue;
                }
              }

              const correspondent = conv.correspondentProfile || {};
              let liUrl = normalizeLinkedInUrl(correspondent.profileUrl || correspondent.profile_url || '');

              // Fallback: If no LinkedIn URL, create a synthetic one using conversation ID
              // This allows us to track conversations even without full LinkedIn profile data
              if (!liUrl) {
                const firstName = correspondent.firstName || correspondent.first_name || 'Unknown';
                const lastName = correspondent.lastName || correspondent.last_name || '';
                liUrl = `https://www.linkedin.com/in/conversation-${convId}`;
                console.log(`   📝 Using synthetic LinkedIn URL for ${firstName} ${lastName} (conversation ${convId})`);
              }

              // Extract campaign info from linkedInAccount if campaignId is missing
              const linkedInAccount = conv.linkedInAccount || {};
              const convCampaignId = conv.campaignId || '';
              const campaignName = convCampaignId ? `Campaign ${convCampaignId}` : '';
              const accountEmail = linkedInAccount.emailAddress || '';

              if (liUrl && !peopleByUrl.has(liUrl)) {
                const personRow = buildPeopleRowFromCorrespondent(correspondent);
                // Override linkedin_url with synthetic URL if needed
                personRow.linkedin_url = liUrl;
                // Enrich with campaign data
                personRow.campaign_id = convCampaignId;
                personRow.campaign_name = campaignName;
                personRow.owner_email = accountEmail;
                peopleByUrl.set(liUrl, true);
                peopleRows.push(personRow);
              }
              const msgs = conv.messages || [];

              // Calculate engagement metrics
              const sentMessages = msgs.filter(m => m.sender === 'ME');
              const receivedMessages = msgs.filter(m => m.sender !== 'ME');
              const firstSentAt = sentMessages[0]?.createdAt || null;
              const firstReceivedAt = receivedMessages[0]?.createdAt || null;
              const lastSentAt = sentMessages[sentMessages.length - 1]?.createdAt || null;
              const lastReceivedAt = receivedMessages[receivedMessages.length - 1]?.createdAt || null;

              // Calculate response time
              let responseTimeHours = null;
              if (firstSentAt && firstReceivedAt) {
                const responseMs = new Date(firstReceivedAt) - new Date(firstSentAt);
                responseTimeHours = Math.round(responseMs / (1000 * 60 * 60) * 10) / 10;
              }

              // Determine conversation stage
              let conversationStage = 'new';
              if (sentMessages.length > 0 && receivedMessages.length === 0) {
                conversationStage = 'contacted';
              } else if (receivedMessages.length > 0) {
                conversationStage = 'engaged';
                const daysSinceLastReceived = (Date.now() - new Date(lastReceivedAt)) / (1000 * 60 * 60 * 24);
                if (daysSinceLastReceived > 14) {
                  conversationStage = 'stale';
                }
              }

              // Thread row (one per conversation)
              const firstAt = msgs.reduce((min, m) => {
                const t = m.createdAt || '';
                return (!min || (t && t < min)) ? t : min;
              }, conv.lastMessageAt || '');
              const totalMessages = typeof conv.totalMessages === 'number' ? conv.totalMessages : msgs.length;
              const lastSender = conv.lastMessageSender || (msgs.length ? msgs[msgs.length - 1].sender : '');
              const lastDirection = lastSender === 'ME' ? 'sent' : (lastSender ? 'received' : '');
              const lastChannel = (msgs.length && msgs[msgs.length - 1].isInMail) ? 'inmail' : 'dm';

              threadRows.push({
                person_match_linkedin_url: liUrl,
                lead_id: '',
                thread_id: convId,
                campaign_id: convCampaignId,
                first_message_at: firstAt,
                last_message_at: lastAt,
                total_messages: String(totalMessages),
                last_message_text: conv.lastMessageText || '',
                last_sender: String(lastSender || ''),
                last_direction: lastDirection,
                last_channel: lastChannel,
                // New engagement metrics
                message_count_sent: sentMessages.length,
                message_count_received: receivedMessages.length,
                first_sent_at: firstSentAt,
                first_received_at: firstReceivedAt,
                last_sent_at: lastSentAt,
                last_received_at: lastReceivedAt,
                response_time_hours: responseTimeHours,
                conversation_stage: conversationStage,
                response_rate: sentMessages.length > 0 ? (receivedMessages.length / sentMessages.length).toFixed(2) : '0',
                messages_json: JSON.stringify(msgs || []),
                conversation_json: JSON.stringify(conv || {})
              });

              // Update watermark
              if (!syncState.threads) syncState.threads = {};
              syncState.threads[convId] = {
                last_message_at: lastAt,
                message_count: totalMessages,
                last_synced: new Date().toISOString()
              };
              for (const m of msgs) {
                const sender = m.sender || '';
                const direction = sender === 'ME' ? 'sent' : (sender ? 'received' : '');
                const channel = m.isInMail ? 'inmail' : 'dm';
                const row = {
                  person_match_linkedin_url: liUrl,
                  lead_id: '',
                  direction,
                  channel,
                  message_id: '',
                  thread_id: convId,
                  campaign_id: convCampaignId,
                  timestamp: m.createdAt || '',
                  body: m.body || '',
                  raw_json: JSON.stringify(m)
                };
                messageRows.push(row);
              }
            }
            offset += items.length;
            if (offset >= totalCount) break;
            if (page + 1 >= INBOX_MAX_PAGES) break;
          }
        }))
      );

      // Validation and duplicate guard
      const validatedPeople = [];
      const seenUrls = new Set();
      for (const person of peopleRows) {
        if (person.linkedin_url && !seenUrls.has(person.linkedin_url)) {
          seenUrls.add(person.linkedin_url);
          validatedPeople.push(person);
        }
      }
      console.log(`   ✅ Validated ${validatedPeople.length} unique people (removed ${peopleRows.length - validatedPeople.length} duplicates)`);

      const validatedThreads = [];
      const seenThreads = new Set();
      for (const thread of threadRows) {
        const key = `${thread.linkedin_url}-${thread.thread_id}`;
        if (!seenThreads.has(key)) {
          seenThreads.add(key);
          validatedThreads.push(thread);
        }
      }
      console.log(`   ✅ Validated ${validatedThreads.length} unique threads (removed ${threadRows.length - validatedThreads.length} duplicates)`);

      // Write outputs and report
      const peopleHeaders = [
        'first_name','last_name','full_name','job_title','company_name','company_domain','linkedin_url','heyreach_lead_id','lead_source','campaign_name','campaign_id','owner_email','lead_status','last_touch_at','last_reply_at'
      ];
      const messagesHeaders = [
        'person_match_linkedin_url','lead_id','direction','channel','message_id','thread_id','campaign_id','timestamp','body','raw_json'
      ];
      const threadsHeaders = [
        'person_match_linkedin_url','lead_id','thread_id','campaign_id','first_message_at','last_message_at','total_messages','last_message_text','last_sender','last_direction','last_channel',
        'message_count_sent','message_count_received','first_sent_at','first_received_at','last_sent_at','last_received_at','response_time_hours','conversation_stage','response_rate',
        'messages_json','conversation_json'
      ];

      const peopleCsvPath = path.join(OUTPUT_DIR, 'people.csv');
      const messagesCsvPath = path.join(OUTPUT_DIR, 'messages.csv');
      const threadsCsvPath = path.join(OUTPUT_DIR, 'threads.csv');
      writeCsv(peopleCsvPath, peopleHeaders, validatedPeople);
      writeCsv(messagesCsvPath, messagesHeaders, messageRows);
      writeCsv(threadsCsvPath, threadsHeaders, validatedThreads);

      // Save watermark for incremental sync
      syncState.last_sync = new Date().toISOString();
      writeJsonSafe(WATERMARK_PATH, syncState);
      console.log(`   💾 Saved watermark for next incremental sync`);

      // Direct Attio API upsert (optional)
      try {
        const p = await attioUpsertPeople(validatedPeople);
        const t = await attioUpsertThreads(validatedThreads);
        console.log(`   Attio upsert: people=${p.upserted}, threads=${t.upserted}${AT_DRY_RUN ? ' (dry-run)' : ''}`);
      } catch (e) {
        console.error('   ✖ Attio upsert failed:', e.message);
      }

      const report = {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startAt,
        input: { listIds: LIST_IDS, pageLimit: PAGE_LIMIT, concurrency: CONCURRENCY },
        counts: { uniqueLeads: 0, peopleRows: peopleRows.length, peopleSkipped: 0, messageRows: messageRows.length, threadRows: threadRows.length },
        skippedPeople: [],
        errors: []
      };
      const reportPath = path.join(OUTPUT_DIR, 'backfill-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

      console.log('✅ Inbox backfill complete');
      console.log(`   People CSV:   ${peopleCsvPath}`);
      console.log(`   Messages CSV: ${messagesCsvPath}`);
      console.log(`   Report:       ${reportPath}`);
      return;
    } catch (e) {
      console.error('   ✖ Inbox flow failed, falling back to per-lead flow:', e.message);
    }
  }

  // 1) Pull all leads (either for each listId or globally if none provided)
  if (LIST_IDS.length > 0) {
  for (const listId of LIST_IDS) {
    console.log(`📥 Fetching leads for list ${listId} ...`);
    try {
      const leads = await fetchLeadsFromList(listId);
      console.log(`   → ${leads.length} leads from list ${listId}`);
      for (const lead of leads) {
        const id = lead.leadId || lead.id || lead.lead_id;
        if (!id) continue;
        if (!uniqueLeadsById.has(id)) uniqueLeadsById.set(id, lead);
      }
    } catch (err) {
      errors.push({ stage: 'fetchLeadsFromList', listId, message: err.message, stack: String(err.stack || '') });
      console.error(`   ✖ Failed to fetch leads for list ${listId}: ${err.message}`);
      }
    }
  } else {
    console.log('📥 Fetching all leads (no HR_LIST_IDS provided) ...');
    try {
      const leads = await fetchLeadsFromList(undefined);
      console.log(`   → ${leads.length} total leads`);
      for (const lead of leads) {
        const id = lead.leadId || lead.id || lead.lead_id;
        if (!id) continue;
        if (!uniqueLeadsById.has(id)) uniqueLeadsById.set(id, lead);
      }
    } catch (err) {
      errors.push({ stage: 'fetchLeads', message: err.message, stack: String(err.stack || '') });
      console.error(`   ✖ Failed to fetch leads: ${err.message}`);
    }
  }

  console.log(`📊 Unique leads collected: ${uniqueLeadsById.size}`);

  // Optional subset for pilot runs
  let leadsArray = Array.from(uniqueLeadsById.values());
  if (MAX_LEADS > 0 && leadsArray.length > MAX_LEADS) {
    leadsArray = leadsArray.slice(0, MAX_LEADS);
    console.log(`   ⚙️ Limiting to first ${MAX_LEADS} leads for pilot`);
  }

  // 2) Build People rows
  const peopleRows = [];
  const skippedPeople = [];
  for (const lead of uniqueLeadsById.values()) {
    const row = extractLeadCore(lead);
    if (!row.linkedin_url) {
      skippedPeople.push({ reason: 'missing_linkedin_url', leadId: row.heyreach_lead_id });
      continue;
    }
    peopleRows.push(row);
  }
  console.log(`👤 People rows prepared: ${peopleRows.length} (skipped: ${skippedPeople.length})`);

  // 3) Pull conversations for each lead (parallel, limited)
  const limit = createLimit(CONCURRENCY);
  const messageRows = [];
  let processed = 0;
  // leadsArray defined above (with optional limit)

  await Promise.all(
    leadsArray.map(lead => limit(async () => {
      const id = lead.leadId || lead.id || lead.lead_id;
      if (!id) return;
      const liUrl = normalizeLinkedInUrl(
        lead.linkedinProfileUrl || lead.linkedin_url || lead.profileUrl || lead.profile_url || ''
      );
      if (!liUrl) return; // cannot link messages without a person match key
      try {
        const conv = await fetchConversationsForLead(id);
        for (const m of conv) {
          const row = extractMessageCore(id, liUrl, m);
          messageRows.push(row);
        }
      } catch (err) {
        errors.push({ stage: 'fetchConversationsForLead', leadId: id, message: err.message, stack: String(err.stack || '') });
      } finally {
        processed += 1;
        if (processed % 100 === 0) {
          console.log(`   … conversations fetched for ${processed}/${leadsArray.length} leads`);
        }
      }
    }))
  );

  console.log(`💬 Message rows prepared: ${messageRows.length}`);

  // 4) Write CSVs
  const peopleHeaders = [
    'first_name','last_name','full_name','job_title','company_name','company_domain','linkedin_url','heyreach_lead_id','lead_source','campaign_name','campaign_id','owner_email','lead_status','last_touch_at','last_reply_at'
  ];
  const messagesHeaders = [
    'person_match_linkedin_url','lead_id','direction','channel','message_id','thread_id','campaign_id','timestamp','body','raw_json'
  ];

  const peopleCsvPath = path.join(OUTPUT_DIR, 'people.csv');
  const messagesCsvPath = path.join(OUTPUT_DIR, 'messages.csv');
  writeCsv(peopleCsvPath, peopleHeaders, peopleRows);
  writeCsv(messagesCsvPath, messagesHeaders, messageRows);

  // 5) Report
  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startAt,
    input: {
      listIds: LIST_IDS,
      pageLimit: PAGE_LIMIT,
      concurrency: CONCURRENCY
    },
    counts: {
      uniqueLeads: uniqueLeadsById.size,
      peopleRows: peopleRows.length,
      peopleSkipped: skippedPeople.length,
      messageRows: messageRows.length
    },
    skippedPeople,
    errors
  };
  const reportPath = path.join(OUTPUT_DIR, 'backfill-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('✅ Backfill complete');
  console.log(`   People CSV:   ${peopleCsvPath}`);
  console.log(`   Messages CSV: ${messagesCsvPath}`);
  console.log(`   Report:       ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error during backfill:', err);
  process.exit(1);
});


