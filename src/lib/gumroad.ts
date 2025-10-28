
import axios from 'axios';

type Listing = { title:string; description:string; price:number; tags:string[]; files:string[]; cover?:string; };

export async function createDraft(listing: Listing) {
  const key = process.env.GUMROAD_API_KEY || '';
  if (!key) { console.log('[dry-run][gumroad] Would create listing:', listing.title); return { id: `dry_${Date.now()}`, url: 'https://gumroad.com/draft' }; }
  const res = await axios.post('https://api.gumroad.com/v2/products', {
    name: listing.title, description: listing.description, price: listing.price, custom_permalink: undefined, published: false
  }, { params: { access_token: key } });
  const productId = res.data?.product?.id ?? res.data?.id ?? 'unknown';
  console.log('[ok] Gumroad draft', productId);
  return { id: productId, url: `https://gumroad.com/products/${productId}` };
}
