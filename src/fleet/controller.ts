import 'dotenv/config';
import axios from 'axios';
import pkg from 'pg';
import { DateTime } from 'luxon';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.FLEET_DB_URL || process.env.DATABASE_URL });

/**
 * Fleet Controller
 * - polls all Ghost node endpoints for health
 * - aggregates metrics from their Postgres databases
 * - logs a unified fleet-level summary
 * - platform agnostic (Lovable, Shopify, custom)
 */

interface NodeConfig {
  name: string;
  baseUrl: string;
  dbUrl: string;
  platform: 'lovable' | 'shopify' | 'custom';
}

const NODES: NodeConfig[] = [
  {
    name: 'Power-Drop',
    baseUrl: 'https://ghost-powerdrop.onrender.com',
    dbUrl: process.env.DB_POWERDROP!,
    platform: 'lovable'
  },
  {
    name: 'TemplateX',
    baseUrl: 'https://ghost-templatex.onrender.com',
    dbUrl: process.env.DB_TEMPLATEX!,
    platform: 'lovable'
  },
  {
    name: 'Dracanus',
    baseUrl: 'https://ghost-dracanus.onrender.com',
    dbUrl: process.env.DB_DRACANUS!,
    platform: 'shopify'
  }
  // add more nodes as needed
];

async function getNodeMetrics(node: NodeConfig) {
  const client = new pkg.Pool({ connectionString: node.dbUrl });
  const summary: Record<string, any> = { node: node.name, platform: node.platform };

  try {
    // Check health endpoint
    const res = await axios.get(`${node.baseUrl}/`);
    summary.health = res.data?.ok ? 'online' : 'unknown';
  } catch {
    summary.health = 'offline';
  }

  try {
    // Pull revenue + subscription totals
    const revenue = await client.query('SELECT COALESCE(SUM(amount),0) AS total FROM revenue_logs;');
    const subs = await client.query("SELECT COUNT(*) AS total FROM subscriptions WHERE status='active';");
    const ai = await client.query('SELECT COUNT(*) AS metrics FROM ai_metrics;');

    summary.totalRevenue = Number(revenue.rows[0].total).toFixed(2);
    summary.activeSubs = Number(subs.rows[0].total);
    summary.aiMetrics = Number(ai.rows[0].metrics);
  } catch (err) {
    summary.error = (err as Error).message;
  } finally {
    await client.end();
  }

  return summary;
}

async function main() {
  const now = DateTime.now().toISO();
  console.log(`\n[FLEET CONTROLLER] Status check @ ${now}`);
  const results = await Promise.all(NODES.map(getNodeMetrics));

  // Save summary to Fleet DB
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fleet_audit (
        id SERIAL PRIMARY KEY,
        node_name TEXT,
        platform TEXT,
        health TEXT,
        total_revenue NUMERIC,
        active_subs INT,
        ai_metrics INT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    for (const r of results) {
      await client.query(`
        INSERT INTO fleet_audit 
        (node_name, platform, health, total_revenue, active_subs, ai_metrics)
        VALUES ($1,$2,$3,$4,$5,$6);
      `, [r.node, r.platform, r.health, r.totalRevenue, r.activeSubs, r.aiMetrics]);
    }
  } catch (err) {
    console.error('[controller] DB insert error:', err);
  } finally {
    client.release();
  }

  console.table(results);
  console.log('[controller] Summary logged ✅');
}

main().then(() => process.exit(0)).catch(err => {
  console.error('[controller] Fatal error:', err);
  process.exit(1);
});
