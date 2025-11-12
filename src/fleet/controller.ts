import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import { DateTime } from 'luxon';
import { CronJob } from 'cron';

const { Pool } = pg;
const FLEET_DB_URL = process.env.FLEET_DB_URL || process.env.DATABASE_URL;
const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';

if (!FLEET_DB_URL) {
  console.error('[FLEET CONTROLLER] ❌ Missing FLEET_DB_URL or DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString: FLEET_DB_URL });

// --- define your sites here ---
const sites = [
  { name: 'PowerDrop', platform: 'lovable', webhook: 'https://power-drop.lovable.app' },
  { name: 'TemplateX', platform: 'lovable', webhook: 'https://templatex.lovable.app' },
  { name: 'Dracanus', platform: 'shopify', webhook: 'https://dracanus.shop' }
];

// --- ensures the audit table exists ---
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fleet_audit (
      id SERIAL PRIMARY KEY,
      site TEXT,
      platform TEXT,
      status TEXT,
      revenue NUMERIC DEFAULT 0,
      subscribers INT DEFAULT 0,
      last_checked TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// --- fetch sample data (mock until Stripe integration expands) ---
async function fetchSiteData(site: { name: string; platform: string; webhook: string }) {
  try {
    // You can replace this with live Stripe data per site later
    const response = await axios.get(site.webhook).catch(() => ({ data: {} }));
    const now = DateTime.now().setZone(TZ).toISO();
    return {
      site: site.name,
      platform: site.platform,
      status: response.data?.ok ? 'online' : 'unknown',
      revenue: Math.floor(Math.random() * 3000), // mock revenue
      subscribers: Math.floor(Math.random() * 50), // mock subs
      last_checked: now
    };
  } catch (err) {
    console.error(`[controller] ${site.name} check failed`, err.message);
    return {
      site: site.name,
      platform: site.platform,
      status: 'offline',
      revenue: 0,
      subscribers: 0,
      last_checked: DateTime.now().setZone(TZ).toISO()
    };
  }
}

// --- logs results to DB ---
async function logResult(result: any) {
  await pool.query(
    `INSERT INTO fleet_audit (site, platform, status, revenue, subscribers, last_checked)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [result.site, result.platform, result.status, result.revenue, result.subscribers, result.last_checked]
  );
}

// --- main controller loop ---
async function runController() {
  console.log(`[FLEET CONTROLLER] Running @ ${DateTime.now().setZone(TZ).toISO()}`);
  await initDB();
  for (const site of sites) {
    const result = await fetchSiteData(site);
    await logResult(result);
    console.log(
      `${site.name.padEnd(12)} | ${site.platform.padEnd(8)} | ${result.status.padEnd(8)} | $${result.revenue} | ${result.subscribers} subs`
    );
  }
  console.log('[controller] ✅ summary logged\n');
}

// --- run now and schedule every 6 hours ---
runController();
new CronJob('0 */6 * * *', runController, null, true, TZ);
