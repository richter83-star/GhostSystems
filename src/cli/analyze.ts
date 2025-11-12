import 'dotenv/config';
import pkg from 'pg';
import { DateTime } from 'luxon';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function analyzeFleet() {
  const now = DateTime.now().setZone(process.env.TIMEZONE ?? 'America/Los_Angeles');
  console.log(`[analyze] Running Fleet AI analysis for ${now.toISODate()}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pull recent metrics (last 7 days)
    const metrics = await client.query(`
      SELECT metric_name, metric_value, period
      FROM ai_metrics
      WHERE period >= $1
      ORDER BY period DESC;
    `, [now.minus({ days: 7 }).toISODate()]);

    const revenueLogs = await client.query(`
      SELECT amount, occurred_at
      FROM revenue_logs
      WHERE occurred_at >= NOW() - INTERVAL '7 days';
    `);

    const subscriptions = await client.query(`
      SELECT status, created_at
      FROM subscriptions;
    `);

    // --- Compute trends ---
    const revenueSeries = revenueLogs.rows.map(r => Number(r.amount) || 0);
    const totalRevenue = revenueSeries.reduce((a, b) => a + b, 0);
    const avgRevenue = revenueSeries.length ? totalRevenue / revenueSeries.length : 0;

    const activeSubs = subscriptions.rows.filter(s => s.status === 'active').length;
    const churnedSubs = subscriptions.rows.filter(s => s.status === 'canceled').length;
    const churnRate = activeSubs > 0 ? ((churnedSubs / (activeSubs + churnedSubs)) * 100).toFixed(2) : 0;

    const last7Days = metrics.rows.reduce<Record<string, number[]>>((acc, row) => {
      if (!acc[row.metric_name]) acc[row.metric_name] = [];
      acc[row.metric_name].push(Number(row.metric_value));
      return acc;
    }, {});

    const growthRates: Record<string, string> = {};
    for (const [metric, values] of Object.entries(last7Days)) {
      if (values.length >= 2) {
        const change = ((values[0] - values.at(-1)!) / Math.max(values.at(-1)!, 1)) * 100;
        growthRates[metric] = `${change.toFixed(2)}%`;
      } else {
        growthRates[metric] = 'n/a';
      }
    }

    // --- Insert summarized AI insights ---
    const insights = [
      `Average daily revenue: $${avgRevenue.toFixed(2)}`,
      `Total 7-day revenue: $${totalRevenue.toFixed(2)}`,
      `Active subscriptions: ${activeSubs}`,
      `Churn rate: ${churnRate}%`,
      `Growth trends: ${JSON.stringify(growthRates)}`
    ].join(' | ');

    await client.query(`
      INSERT INTO ai_metrics (metric_name, metric_value, period, notes)
      VALUES ('weekly_insights', 0, $1, $2);
    `, [now.toISODate(), insights]);

    await client.query('COMMIT');
    console.log(`[analyze] Fleet analysis complete — insights stored`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[analyze] Error:', err);
  } finally {
    client.release();
  }
}

analyzeFleet()
  .then(() => {
    console.log('[analyze] Done');
    process.exit(0);
  })
  .catch(err => {
    console.error('[analyze] Fatal error:', err);
    process.exit(1);
  });
