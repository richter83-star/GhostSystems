import { getGumroadSales } from '../lib/analytics/gumroadPull.js';
import { getLemonSales } from '../lib/analytics/lemonPull.js';
import { notionLog } from '../lib/notionSync.js';
import { db } from '../lib/tracking.js';
import { seedAudience } from '../lib/metaSeed.js';

async function main() {
  const gumroadSales = await getGumroadSales();
  const lemonSales = await getLemonSales();
  const allSales = [...gumroadSales, ...lemonSales];

  if (!allSales.length) {
    console.log('[sync] No new sales');
    return;
  }

  const conn = await db();
  const emails: string[] = [];

  for (const sale of allSales) {
    await conn.run(
      'INSERT OR REPLACE INTO sales(id,sku,amount_cents,created_at) VALUES(?,?,?,?)',
      sale.id,
      sale.sku,
      sale.amount_cents,
      sale.created_at
    );

    await notionLog({
      sku: sale.sku,
      title: sale.title,
      platform: sale.platform,
      price_cents: sale.amount_cents,
      sales: 1,
      revenue: sale.amount_cents / 100,
      cr: 0.0
    });

    if (sale.email) {
      emails.push(sale.email);
    }
  }

  if (emails.length) {
    await seedAudience(emails);
  }

  console.log(`[sync] Updated ${allSales.length} sales → Notion + Meta`);
}

main().catch((error) => {
  console.error('[sync] Failed to update analytics', error);
  process.exitCode = 1;
});
