// src/controllers/shopifyController.ts
import axios from "axios";

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error("❌ Missing Shopify credentials in environment variables");
}

export async function fetchShopifyData() {
  console.log("[FleetController] Syncing Shopify store data...");

  try {
    // --- Fetch Products ---
    const productsRes = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/products.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    const products = productsRes.data.products;
    console.log(`✅ Synced ${products.length} products`);

    // --- Fetch Orders ---
    const ordersRes = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/orders.json?status=any`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    const orders = ordersRes.data.orders;
    console.log(`✅ Synced ${orders.length} orders`);

    // --- Fetch Customers ---
    const customersRes = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/customers.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );
    const customers = customersRes.data.customers;
    console.log(`✅ Synced ${customers.length} customers`);

    return {
      ok: true,
      stats: {
        products: products.length,
        orders: orders.length,
        customers: customers.length,
      },
    };
  } catch (err: any) {
    console.error("❌ Shopify sync failed:", err.response?.data || err.message);
    return { ok: false, error: err.message };
  }
}
