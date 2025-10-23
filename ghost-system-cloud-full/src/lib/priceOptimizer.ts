import fs from 'fs'; import path from 'path'; import { db } from './tracking.js';
function clamp(n:number,min:number,max:number){ return Math.min(Math.max(n,min),max); }
export async function optimizePrices(metaDir='data/meta'){
  const conn=await db(); const metas=fs.readdirSync(metaDir).filter(f=>f.endsWith('.json'));
  for(const f of metas){ const p=path.join(metaDir,f); const meta=JSON.parse(fs.readFileSync(p,'utf-8')); const sku=meta.sku;
    const rows=await conn.all('SELECT * FROM sales WHERE sku = ? AND created_at >= datetime("now","-7 days")', sku);
    const sales=rows.length; let newPrice=meta.price_cents;
    if(sales>=5) newPrice=Math.round(meta.price_cents*1.2); else if(sales===0) newPrice=Math.round(meta.price_cents*0.8);
    newPrice=clamp(newPrice,500,99900);
    if(newPrice!==meta.price_cents){ const variant=`${sku}_p${Math.floor(Math.random()*1000)}`; const next={...meta, sku:variant, price_cents:newPrice, title:meta.title};
      fs.writeFileSync(path.join(metaDir,`${variant}.json`), JSON.stringify(next,null,2)); console.log(`[optimize] ${sku} sales7d=${sales} -> ${variant} @ $${(newPrice/100).toFixed(2)}`);
    } else { console.log(`[optimize] ${sku} unchanged (sales7d=${sales})`); }
  }
}
