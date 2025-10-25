import fs from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';

export type DatabaseConnection = {
  run(sql: string, ...params: unknown[]): Promise<void>;
  all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
};

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath);
  return fs.mkdir(dir, { recursive: true });
}

function wrapDatabase(database: sqlite3.Database): DatabaseConnection {
  return {
    run(sql: string, ...params: unknown[]) {
      return new Promise<void>((resolve, reject) => {
        database.run(sql, params, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    all<T = unknown>(sql: string, ...params: unknown[]) {
      return new Promise<T[]>((resolve, reject) => {
        database.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows as T[]);
          }
        });
      });
    },
    exec(sql: string) {
      return new Promise<void>((resolve, reject) => {
        database.exec(sql, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        database.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  };
}

export async function db(): Promise<DatabaseConnection> {
  const url = process.env.DATABASE_URL ?? 'file:./data/meta/sales.sqlite';
  const filePath = url.replace('file:', '');
  await ensureDirectory(filePath);

  const database = await new Promise<sqlite3.Database>((resolve, reject) => {
    const instance = new sqlite3.Database(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(instance);
      }
    });
  });

  const connection = wrapDatabase(database);

  await connection.exec(
    `CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY, sku TEXT, amount_cents INTEGER, created_at TEXT);`
  );
  await connection.exec(
    `CREATE TABLE IF NOT EXISTS products(sku TEXT PRIMARY KEY, title TEXT, kind TEXT, status TEXT, url TEXT, created_at TEXT);`
  );

  return connection;
}
