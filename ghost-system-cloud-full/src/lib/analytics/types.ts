export type SaleRecord = {
  id: string;
  sku: string;
  title: string;
  amount_cents: number;
  created_at: string;
  platform: 'gumroad' | 'lemon';
  email?: string | null;
};
