import 'dotenv/config';
import axios from 'axios';
import { DateTime } from 'luxon';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.FLEET_DB_URL || process.env.DATABASE_URL });
const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';
const API_KEY = process.env.ABACUS_API_KEY;

if (!API_KEY) {
  console.error('[abacus] ❌ Missing ABACUS_API_KEY');
  process.exit(1);
}

async function fetchAbacusProjects() {
  const res = await axios.get('https://api.abacus.ai/api/v0/projects', {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  return res.data.projects || [];
}

async function syncAbacusProjects() {
  console.log(`[abacus] Sync started @ ${DateTime.now().setZone(TZ).toISO()}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abacus_projects (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const projects = await fetchAbacusProjects();

  for (const p of projects) {
    await pool.query(
      `INSERT INTO abacus_projects (id, name, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             status = EXCLUDED.status,
             updated_at = NOW();`,
      [p.id, p.name, p.status, p.createdAt]
    );
    console.log(`[abacus] Synced project: ${p.name} (${p.status})`);
  }

  console.log('[abacus] ✅ Sync complete');
  await pool.end();
}

syncAbacusProjects().catch(err => {
  console.error('[abacus] ❌ Error:', err.message);
  process.exit(1);
});
