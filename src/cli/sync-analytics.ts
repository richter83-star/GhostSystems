import 'dotenv/config';
import pkg from 'pg';
import { DateTime } from 'luxon';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const now = DateTime.now().setZone(process.env.TIMEZONE ?? 'America/Los_Angeles');
  const start = now.startOf('day').toISO();
  const end = now.endOf('day').toISO();

  console.log(`[analytics] Running nightly Fleet sync for ${now.toISODate()}`);

  const client = await pool.connect();
  try {
    // Aggregate daily totals
    const revenueQuery = await client.query(`
      SELECT COALESCE(SUM(amount), 0) AS total_revenue
      FROM revenue_logs
      WHERE occurred_at BETWEEN $1 AND $2;
    `, [start, end]);

    const subscriptionQuery = await client.query(`
      SELECT COUNT(DISTINCT stripe_subscription_id) AS active_subs
      FROM subscriptions
      WHERE status = 'active';
    `);

    const eventQuery = await client.query(`
      SELECT COUNT(*) AS event_count
      FROM revenue_logs
      WHERE occurred_at BETWEEN $1 AND $2;
    `, [start, end]);

    const totalRevenue = Number(revenueQuery.rows[0].total_revenue);
    const activeSubs = Number(subscriptionQuery.rows[0].active_subs);
    const eventCount = Number(eventQuery.rows[0].event_count);

    // Insert metrics for AI analysis
    await client.query(`
      INSERT INTO ai_metrics (metric_name, metric_value, period, notes)
      VALUES 
        ('daily_revenue', $1, $2, 'Total revenue generated today'),
        ('active_subscriptions', $3, $2, 'Current active subscriptions'),
        ('event_count', $4, $2, 'Total Stripe events processed today');
    `, [totalRevenue, now.toISODate(), activeSubs, eventCount]);

    console.log(`[analytics] Recorded metrics: revenue=$${totalRevenue.toFixed(2)}, activeSubs=${activeSubs}, events=${eventCount}`);
  } catch (err) {
    console.error('[analytics] Error during nightly sync:', err);
  } finally {
    client.release();
  }
}

main().then(() => {
  console.log('[analytics] Done');
  process.exit(0);
}).catch((err) => {
  console.error('[analytics] Fatal error:', err);
  process.exit(1);
});
