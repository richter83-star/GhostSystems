import express from 'express';
import Stripe from 'stripe';
import pkg from 'pg';
import bodyParser from 'body-parser';

const { Pool } = pkg;
const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data = event.data.object;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // --- CUSTOMER SYNC ---
    if (data.customer_email || data.customer) {
      await client.query(`
        INSERT INTO customers (stripe_customer_id, email, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (stripe_customer_id) DO UPDATE
          SET email = EXCLUDED.email, name = EXCLUDED.name;
      `, [data.customer, data.customer_email || null, data.customer_name || null]);
    }

    // --- PRODUCT SYNC ---
    if (data.plan || data.display_items) {
      const productId = data.plan?.product || data.display_items?.[0]?.price?.product;
      const price = data.plan?.amount / 100 || data.display_items?.[0]?.amount / 100 || null;
      await client.query(`
        INSERT INTO products (stripe_product_id, name, price)
        VALUES ($1, $2, $3)
        ON CONFLICT (stripe_product_id) DO UPDATE
          SET name = EXCLUDED.name, price = EXCLUDED.price;
      `, [productId, data.plan?.nickname || 'Unnamed Product', price]);
    }

    // --- SUBSCRIPTION SYNC ---
    if (data.subscription) {
      await client.query(`
        INSERT INTO subscriptions (stripe_subscription_id, status)
        VALUES ($1, $2)
        ON CONFLICT (stripe_subscription_id) DO UPDATE
          SET status = EXCLUDED.status, updated_at = NOW();
      `, [data.subscription, data.status]);
    }

    // --- REVENUE LOG ---
    await client.query(`
      INSERT INTO revenue_logs (stripe_event_id, event_type, amount, currency, occurred_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (stripe_event_id) DO NOTHING;
    `, [
      event.id,
      event.type,
      data.amount_total ? data.amount_total / 100 : null,
      data.currency || 'usd'
    ]);

    // --- AUTOMATION TRIGGER ---
    await client.query(`
      INSERT INTO automation_triggers (trigger_name, event_source, payload)
      VALUES ($1, $2, $3);
    `, [event.type, 'stripe', JSON.stringify(data)]);

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

export default router;
