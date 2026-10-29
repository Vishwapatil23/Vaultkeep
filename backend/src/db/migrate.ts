import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'vaultkeep_db';
const DB_USER = process.env.DB_USER || 'vaultkeep_admin';
const DB_PASSWORD = process.env.DB_PASSWORD || 'VaultKeepSecureDevPassword2026!';
const DB_SSL = process.env.DB_SSL === 'true';

async function runMigrations() {
  console.log('====================================================');
  console.log('   VaultKeep Database Migration Engine');
  console.log(`   Target: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  console.log('====================================================');

  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: DB_SSL ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  try {
    console.log('[Migration] Successfully connected to database.');

    // Ensure schema migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const migrationsDir = path.resolve(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[Migration] Found ${files.length} migration file(s) in ${migrationsDir}`);

    for (const file of files) {
      const check = await client.query('SELECT filename FROM schema_migrations WHERE filename = $1', [file]);
      if (check.rows.length > 0) {
        console.log(`[Migration] Skipped (already applied): ${file}`);
        continue;
      }

      console.log(`[Migration] Applying: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migration] SUCCESS: ${file} applied successfully.`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[Migration] ERROR in ${file}:`, err.message);
        throw err;
      }
    }

    console.log('[Migration] All migrations completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Migration Failed]', err.message);
    process.exit(1);
  });
