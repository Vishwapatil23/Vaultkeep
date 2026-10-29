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

async function runSeed() {
  console.log('====================================================');
  console.log('   VaultKeep Database Seed Engine');
  console.log(`   Target: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  console.log('====================================================');

  const caPath = process.env.DB_CA_PATH
    ? path.resolve(process.env.DB_CA_PATH)
    : fs.existsSync(path.resolve(__dirname, 'certs/rds-ca-bundle.pem'))
      ? path.resolve(__dirname, 'certs/rds-ca-bundle.pem')
      : path.resolve(__dirname, '../../certs/rds-ca-bundle.pem');

  let sslConfig: any = false;
  if (DB_SSL) {
    if (fs.existsSync(caPath)) {
      sslConfig = {
        rejectUnauthorized: true,
        ca: fs.readFileSync(caPath).toString(),
      };
      console.log(`[Seed] Using verified Amazon RDS CA certificate bundle from: ${caPath}`);
    } else {
      sslConfig = { rejectUnauthorized: true };
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
    const seedFile = path.resolve(__dirname, 'seeds/demo_seed.sql');
    if (!fs.existsSync(seedFile)) {
      throw new Error(`Seed file not found: ${seedFile}`);
    }

    console.log(`[Seed] Applying synthetic seed from ${seedFile}...`);
    const sql = fs.readFileSync(seedFile, 'utf-8');

    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('[Seed] Synthetic demonstration data seeded successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Seed Error]', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed Failed]', err.message);
    process.exit(1);
  });
