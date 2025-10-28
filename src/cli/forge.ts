import { execFileSync } from 'node:child_process'; import fs from 'fs'; import fg from 'fast-glob';
import { createDraft } from '../lib/gumroad.js'; import { createLemonProduct } from '../lib/lemon.js';
import { db } from '../lib/tracking.js'; import { mdToPdf } from '../lib/mdToPdf.js'; import { choosePrice } from '../lib/splitTest.js';
async function main(){ console.log('[forge] Generating products with Python…'); execFileSync('python',['python/product_generator.py'],{stdio:'inherit'}); execFileSync('python',['python/formatter.py'],{stdio:'inherit'});
  const mdFiles=await fg('data/products/**/*.md'); const pdfMap:Record<string,string>={}; for(const mdFile of mdFiles){ const pdf=await mdToPdf(mdFile,'data/media'); pdfMap[mdFile]=pdf; }
  const metas=await fg('data/meta/*.json'); const conn=await db();
  for(const metaPath of metas){ const meta=JSON.parse(fs.readFileSync(metaPath,'utf-8')); meta.price_cents=choosePrice(meta.price_cents);
    const assets=meta.assets.map((p:string)=> pdfMap[p]? pdfMap[p]:p);
    const draft=(process.env.DEFAULT_PLATFORM==='lemon')? await createLemonProduct(meta) : await createDraft({title:meta.title, description:meta.description, price:meta.price_cents, tags:meta.tags, files:assets, cover:meta.cover});
    await conn.run('INSERT OR REPLACE INTO products(sku,title,kind,status,url,created_at) VALUES(?,?,?,?,?,datetime("now"))', meta.sku, meta.title, meta.kind, 'draft', draft.url);
    console.log(`[forge] Draft ready: ${meta.title} -> ${draft.url}`);
  } }
main().catch(e=>{ console.error(e); process.exit(1); });
