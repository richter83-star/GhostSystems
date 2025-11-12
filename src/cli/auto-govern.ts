import 'dotenv/config';
import pkg from 'pg';
import Stripe from 'stripe';
import { DateTime } from 'luxon';
import axios from 'axios';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';

async function main() {
  const now = DateTime.now().setZone(TZ);
  console.log(`[govern] Fleet automation governor running @ ${now.toISO()}`);

  const client = await pool.connect();

  try {
    const pending = await client.query(`
      SELECT id, trigger_name, event_source, payload
      FROM automation_triggers
      WHERE executed = false
      ORDER BY created_at ASC
      LIMIT 50;
    `);

    if (pending.rows.length === 0) {
      console.log('[govern] No new triggers.');
      return;
    }

    for (const row of pending.rows) {
      const { id, trigger_name, event_source, payload } = row;
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      let actionResult = 'no-op';

      try {
        /* ---------------- STRIPE LOGIC ---------------- */
        if (event_source === 'stripe') {
          switch (trigger_name) {
            case 'invoice.payment_failed':
              console.log(`[govern] ⚠️ Payment failed for ${data.customer_email || data.customer}`);
              // example: downgrade or notify user
              actionResult = 'payment-failure-notified';
              break;

            case 'checkout.session.completed':
              console.log(`[govern] ✅ Checkout complete for ${data.customer_email}`);
              // example: reward or upsell logic
              actionResult = 'new-customer-welcome-queued';
              break;

            case 'customer.subscription.updated':
              if (data.status === 'active') {
                console.log(`[govern] 🔁 Active subscription verified.`);
                actionResult = 'subscription-confirmed';
              }
              break;

            case 'customer.subscription.deleted':
              console.log(`[govern] ❌ Subscription canceled.`);
              actionResult = 'subscription-canceled';
              break;

            default:
              console.log(`[govern] No handler for ${trigger_name}`);
          }
        }

        /* ---------------- AI METRIC REACTIONS ---------------- */
        if (event_source === 'ai_metrics') {
          if (trigger_name === 'weekly_insights') {
            console.log('[govern] 📊 Weekly insights ready — evaluating potential actions...');
            // example: auto price adjustment if revenue growth > 20%
            if (data.notes?.includes('daily_revenue')) {
              const match = data.notes.match(/"daily_revenue":\s*"([\d.-]+)%"/);
              if (match && parseFloat(match[1]) > 20) {
                // simulate price increase
                console.log('[govern] 🚀 Detected >20% growth, preparing dynamic price adjustment...');
                actionResult = 'dynamic-pricing-pending';
              }
            }
          }
        }

        /* ---------------- EXTERNAL WEBHOOKS ---------------- */
        // example: notify external service like Slack, Zapier, or Lovable webhook endpoint
        await axios.post('https://hookdeck.com/api/webhook-test', {
          trigger_name,
          event_source,
          data,
          result: actionResult,
          timestamp: now.toISO(),
        }).catch(() => console.log('[govern] External webhook skipped (test endpoint).'));

        // Mark as executed
        await client.query(`
          UPDATE automation_triggers
          SET executed = true, executed_at = NOW()
          WHERE id = $1;
        `, [id]);

        console.log(`[govern] ✅ Trigger ${id} processed (${actionResult})`);
      } catch (err) {
        console.error(`[govern] ❌ Error processing trigger ${id}:`, err);
      }
    }

  } catch (err) {
    console.error('[govern] General error:', err);
  } finally {
    client.release();
  }
}

main().then(() => {
  console.log('[govern] Done');
  process.exit(0);
}).catch(err => {
  console.error('[govern] Fatal error:', err);
  process.exit(1);
});
