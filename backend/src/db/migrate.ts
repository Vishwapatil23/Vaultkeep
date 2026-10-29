import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const DB_HOST = process.env.DB_HOST;
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_SSL = process.env.DB_SSL === 'true';

const missingVars: string[] = [];
if (!DB_HOST) missingVars.push('DB_HOST');
if (!DB_NAME) missingVars.push('DB_NAME');
if (!DB_USER) missingVars.push('DB_USER');
if (!DB_PASSWORD) missingVars.push('DB_PASSWORD');

if (missingVars.length > 0) {
  console.error(`[Migration Error] Missing required database configuration environment variables: ${missingVars.join(', ')}.`);
  process.exit(1);
}

async function runMigrations() {
  console.log('====================================================');
  console.log('   VaultKeep Database Migration Engine');
  console.log(`   Target: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  console.log('====================================================');

  const configuredCaPath = process.env.DB_CA_PATH || 'certs/rds-ca-bundle.pem';
  let caPath = path.isAbsolute(configuredCaPath)
    ? configuredCaPath
    : path.resolve(process.cwd(), configuredCaPath);

  if (!fs.existsSync(caPath)) {
    const fallbackCandidates = [
      path.resolve(__dirname, '../../certs/rds-ca-bundle.pem'),
      path.resolve(__dirname, '../certs/rds-ca-bundle.pem'),
      path.resolve(__dirname, 'certs/rds-ca-bundle.pem'),
    ];
    for (const candidate of fallbackCandidates) {
      if (fs.existsSync(candidate)) {
        caPath = candidate;
        break;
      }
    }
  }

  let sslConfig: any = false;
  if (DB_SSL) {
    if (fs.existsSync(caPath)) {
      sslConfig = {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath).toString(),
      };
      console.log(`[Migration] Using verified Amazon RDS CA certificate bundle from: ${caPath}`);
    } else {
      throw new Error(
        `[Migration Error] Amazon RDS CA bundle not found at '${caPath}'. ` +
        `Ensure certs/rds-ca-bundle.pem exists relative to backend working directory or set DB_CA_PATH.`
      );
    }
  }

  const pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: sslConfig,
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
