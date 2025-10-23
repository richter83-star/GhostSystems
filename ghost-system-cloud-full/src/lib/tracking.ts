import sqlite3 from 'sqlite3'; import { open } from 'sqlite';
export async function db() {
  const url = process.env.DATABASE_URL ?? 'file:./data/meta/sales.sqlite';
  const conn = await open({ filename: url.replace('file:', ''), driver: sqlite3.Database });
  await conn.exec(`CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY, sku TEXT, amount_cents INTEGER, created_at TEXT);`);
  await conn.exec(`CREATE TABLE IF NOT EXISTS products(sku TEXT PRIMARY KEY, title TEXT, kind TEXT, status TEXT, url TEXT, created_at TEXT);`);
  return conn;
}
