// src/server.ts
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { CronJob } from 'cron';
import { DateTime } from 'luxon';
import { execFileSync } from 'child_process';
import crypto from 'crypto';

const TZ = process.env.TIMEZONE ?? 'America/Los_Angeles';
const app = express();
app.use(express.json());

// ---- Shopify Routes ---- //
app.get('/api/shopify', (_req, res) => {
  res.status(200).json({ ok: true, msg: 'FleetController connected to Shopify' });
});

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

// ---- Cron Jobs ---- //
function job(spec: string, name: string, cmd: string, args: string[]) {
  return new CronJob(spec, async () => {
    const iso = DateTime.now().setZone(TZ).toISO();
    console.log(`[cron:${name}] firing @ ${iso}`);
    try {
      execFileSync(cmd, args, { stdio: 'inherit' });
    } catch (e) {
      console.error(`[cron:${name}] error`, e);
    }
  }, null, true, TZ);
}

job('0 5 * * 1', 'weekly', 'npm', ['run', 'weekly']);
job('30 3 * * *', 'nightly', 'npm', ['run', 'sync']);

// ---- Server ---- //
const port = process.env.PORT || 10000;
http.createServer(app).listen(port, () => {
  console.log(`[FleetController] live on port ${port}`);
});
