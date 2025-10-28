import axios from 'axios';
import { SaleRecord } from './types.js';

type GumroadSale = {
  id?: string | number;
  sale_id?: string | number;
  created_at?: string;
  email?: string | null;
  price_cents?: number;
  price?: number;
  amount_cents?: number;
  product_id?: string | number;
  product_name?: string;
  short_product_id?: string;
  product_permalink?: string;
};

function toCents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return Math.round(parsed);
    }
  }
  return 0;
}

function normaliseSku(sale: GumroadSale): string {
  const sku = sale.product_permalink ?? sale.short_product_id ?? sale.product_id;
  if (sku === undefined || sku === null) {
    return 'gumroad-product';
  }
  return String(sku);
}

function normaliseId(sale: GumroadSale): string {
  const id = sale.id ?? sale.sale_id ?? sale.created_at;
  if (id === undefined || id === null) {
    return `gumroad-${Date.now()}`;
  }
  return String(id);
}

function normaliseTitle(sale: GumroadSale): string {
  return sale.product_name ?? normaliseSku(sale);
}

export async function getGumroadSales(): Promise<SaleRecord[]> {
  const token = process.env.GUMROAD_API_KEY;
  if (!token) {
    console.log('[gumroad] Missing API key, skipping sync.');
    return [];
  }

  try {
    const response = await axios.get('https://api.gumroad.com/v2/sales', {
      params: { access_token: token },
      timeout: 15_000
    });

    const sales: GumroadSale[] = response.data?.sales ?? [];

    return sales.map((sale) => ({
      id: normaliseId(sale),
      sku: normaliseSku(sale),
      title: normaliseTitle(sale),
      amount_cents: toCents(sale.price_cents ?? sale.amount_cents ?? sale.price),
      created_at: sale.created_at ?? new Date().toISOString(),
      platform: 'gumroad',
      email: sale.email ?? null
    }));
  } catch (error) {
    console.error('[gumroad] Failed to fetch sales', error);
    return [];
  }
}
