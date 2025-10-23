import axios from 'axios';
const key = process.env.LEMON_API_KEY || '';
const store = process.env.LEMON_STORE_ID || '';

export async function createLemonProduct(meta:any) {
  if (!key || !store){ console.log('[dry-run][lemon]', meta.title); return { id:`dry_${Date.now()}`,url:'https://lemonsqueezy.com' }; }
  const res = await axios.post(`https://api.lemonsqueezy.com/v1/products`, {
    data:{ type:'products', attributes:{ name:meta.title, price:meta.price_cents/100, description:meta.description, status:'draft', slug:meta.sku },
           relationships:{ store:{ data:{ type:'stores', id:store } } } }
  }, { headers:{ Authorization:`Bearer ${key}`, Accept:'application/vnd.api+json' } });
  const id = res.data?.data?.id;
  console.log('[ok] Lemon draft', id);
  return { id, url:`https://app.lemonsqueezy.com/products/${id}` };
}
