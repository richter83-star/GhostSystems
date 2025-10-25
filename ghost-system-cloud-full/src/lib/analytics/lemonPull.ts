import axios from 'axios';
import { SaleRecord } from './types.js';

type LemonOrder = {
  id?: string | number;
  attributes?: {
    created_at?: string;
    total?: number;
    subtotal?: number;
    identifier?: string;
    order_number?: number;
    status?: string;
    email?: string;
    user_email?: string;
    first_order_item?: {
      product_name?: string;
      variant_name?: string;
    };
  };
};

function toCents(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return Math.round(parsed * 100);
    }
  }
  return 0;
}

function resolveSku(order: LemonOrder): string {
  const candidate = order.attributes?.identifier ?? order.attributes?.order_number;
  if (candidate === undefined || candidate === null) {
    return 'lemon-order';
  }
  return String(candidate);
}

function resolveId(order: LemonOrder): string {
  const id = order.id ?? order.attributes?.identifier;
  if (id === undefined || id === null) {
    return `lemon-${Date.now()}`;
  }
  return String(id);
}

function resolveTitle(order: LemonOrder): string {
  return (
    order.attributes?.first_order_item?.product_name ??
    order.attributes?.first_order_item?.variant_name ??
    resolveSku(order)
  );
}

export async function getLemonSales(): Promise<SaleRecord[]> {
  const token = process.env.LEMON_API_KEY;
  if (!token) {
    console.log('[lemon] Missing API key, skipping sync.');
    return [];
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.api+json'
  };

  const store = process.env.LEMON_STORE_ID;

  try {
    const response = await axios.get('https://api.lemonsqueezy.com/v1/orders', {
      headers,
      params: store ? { 'filter[store_id]': store, 'page[size]': 100 } : { 'page[size]': 100 },
      timeout: 15_000
    });

    const orders: LemonOrder[] = response.data?.data ?? [];

    return orders.map((order) => ({
      id: resolveId(order),
      sku: resolveSku(order),
      title: resolveTitle(order),
      amount_cents: toCents(order.attributes?.total ?? order.attributes?.subtotal ?? 0),
      created_at: order.attributes?.created_at ?? new Date().toISOString(),
      platform: 'lemon',
      email: order.attributes?.user_email ?? order.attributes?.email ?? null
    }));
  } catch (error) {
    console.error('[lemon] Failed to fetch orders', error);
    return [];
  }
}
