import 'dotenv/config';
import express from 'express';
import http from 'http';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import { execFileSync } from 'child_process';
import Stripe from 'stripe';
import pkg from 'pg';
import bodyParser from 'body-parser';

const { Pool } = pkg;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';

/* ----------------------  CRON JOBS ---------------------- */
function job(spec: string, name: string, cmd: string, args: string[]) {
  return new CronJob(
    spec,
    async () => {
      const iso = DateTime.now().setZone(TZ).toISO();
      console.log(`[cron:${name}] firing @ ${iso}`);
      try {
        execFileSync(cmd, args, { stdio: 'inherit' });
      } catch (e) {
        console.error(`[cron:${name}] error`, e);
      }
    },
    null,
    true,
    TZ
  );
}

job('0 5 * * 1', 'weekly', 'npm', ['run', 'weekly']);
job('30 3 * * *', 'nightly', 'npm', ['run', 'sync']);

/* ------------------  STRIPE WEBHOOK ------------------ */
app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('⚠️  Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data: any = event.data.object;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // CUSTOMER SYNC
    if (data.customer_email || data.customer) {
      await client.query(
        `INSERT INTO customers (stripe_customer_id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (stripe_customer_id) DO UPDATE
           SET email = EXCLUDED.email, name = EXCLUDED.name;`,
        [data.customer, data.customer_email || null, data.customer_name || null]
      );
    }

    // PRODUCT SYNC
    if (data.plan || data.display_items) {
      const productId = data.plan?.product || data.display_items?.[0]?.price?.product;
      const price = data.plan?.amount / 100 || data.display_items?.[0]?.amount / 100 || null;
      await client.query(
        `INSERT INTO products (stripe_product_id, name, price)
         VALUES ($1, $2, $3)
         ON CONFLICT (stripe_product_id) DO UPDATE
           SET name = EXCLUDED.name, price = EXCLUDED.price;`,
        [productId, data.plan?.nickname || 'Unnamed Product', price]
      );
    }

    // SUBSCRIPTION SYNC
    if (data.subscription) {
      await client.query(
        `INSERT INTO subscriptions (stripe_subscription_id, status)
         VALUES ($1, $2)
         ON CONFLICT (stripe_subscription_id) DO UPDATE
           SET status = EXCLUDED.status, updated_at = NOW();`,
        [data.subscription, data.status]
      );
    }

    // REVENUE LOG
    await client.query(
      `INSERT INTO revenue_logs (stripe_event_id, event_type, amount, currency, occurred_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (stripe_event_id) DO NOTHING;`,
      [
        event.id,
        event.type,
        data.amount_total ? data.amount_total / 100 : null,
        data.currency || 'usd'
      ]
    );

    // AUTOMATION TRIGGER
    await client.query(
      `INSERT INTO automation_triggers (trigger_name, event_source, payload)
       VALUES ($1, $2, $3);`,
      [event.type, 'stripe', JSON.stringify(data)]
    );

    await client.query('COMMIT');
    res.sendStatus(200);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database insert error:', err);
    res.sendStatus(500);
  } finally {
    client.release();
  }
});

/* ----------------------  SERVER ---------------------- */
app.get('/', (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const port = process.env.PORT || 8080;
const server = http.createServer(app);

server.listen(port, () => console.log(`[runner] up on ${port}`));

