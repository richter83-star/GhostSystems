// src/server.ts
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import axios from 'axios';

const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';
const app = express();
app.use(express.json());

/* -------------------------------------------------------
   SHOPIFY ROUTES
------------------------------------------------------- */

// 1️⃣ Basic connection check
app.get('/api/shopify', (_req, res) => {
  res.status(200).json({ ok: true, msg: 'FleetController connected to Shopify' });
});

// 2️⃣ Shopify webhook receiver (for live order events)
app.post('/api/shopify/webhook', (req, res) => {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? '';
  const digest = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body), 'utf8')
    .digest('base64');

  if (hmac !== digest) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('[Shopify webhook event]', req.body);
  res.status(200).json({ ok: true });
});

// 3️⃣ Shopify sync (Fleet pulls data automatically)
app.get('/api/shopify/sync', async (_req, res) => {
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    return res.status(400).json({ ok: false, error: 'Missing Shopify credentials' });
  }

  try {
    console.log('[FleetController] Syncing Shopify data...');

    // --- Products ---
    const prod = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/products.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    const products = prod.data.products ?? [];
    console.log(`✅ Synced ${products.length} products`);

    // --- Orders ---
    const ord = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/orders.json?status=any`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    const orders = ord.data.orders ?? [];
    console.log(`✅ Synced ${orders.length} orders`);

    // --- Customers ---
    const cust = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/customers.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
    const customers = cust.data.customers ?? [];
    console.log(`✅ Synced ${customers.length} customers`);

    res.json({
      ok: true,
      stats: {
        products: products.length,
        orders: orders.length,
        customers: customers.length,
      },
    });
  } catch (err: any) {
    console.error('❌ Shopify sync failed:', err.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------------------------------------------
   CRON JOBS
------------------------------------------------------- */
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

// existing cron jobs
job('0 5 * * 1', 'weekly', 'npm', ['run', 'weekly']);
job('30 3 * * *', 'nightly', 'npm', ['run', 'sync']);

// optional: automatic Shopify sync every 2 hours
job('0 */2 * * *', 'shopify-sync', 'curl', [
  '-s',
  `${process.env.RENDER_EXTERNAL_URL ?? 'https://ghostsystems.onrender.com'}/api/shopify/sync`,
]);

/* -------------------------------------------------------
   SERVER
------------------------------------------------------- */
const port = process.env.PORT || 10000;
http.createServer(app).listen(port, () => {
  console.log(`[FleetController] live on port ${port}`);
});
