import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const DB_HOST = process.env.DB_HOST || 'vaultkeep-postgresql-db.cyrw6icwadyc.us-east-1.rds.amazonaws.com';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'vaultkeep_db';
const DB_USER = process.env.DB_USER || 'vaultkeep_admin';
const DB_PASSWORD = process.env.DB_PASSWORD || 'VaultKeepSecureDevPassword2026!';
const DB_SSL = process.env.DB_SSL ? process.env.DB_SSL === 'true' : true;

const isPgConfigured = process.env.USE_IN_MEMORY_DB !== 'true';

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
    console.log(`[Amazon RDS PostgreSQL Pool] TLS enabled with verified AWS RDS CA bundle: ${caPath}`);
  } else {
    sslConfig = { rejectUnauthorized: true };
  }
}

let pool: Pool | null = null;

if (isPgConfigured) {
  pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: sslConfig,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[Amazon RDS PostgreSQL Pool Error]', err.message);
  });
}

// In-Memory Storage Engine for Standalone Testing & Zero-Dependency Local Demos
interface MemoryStore {
  users: any[];
  owner_settings: any[];
  nominees: any[];
  documents: any[];
  document_release_rules: any[];
  check_ins: any[];
  account_lifecycle: any[];
  release_grants: any[];
  notifications: any[];
  audit_logs: any[];
  security_events: any[];
}

const memoryStore: MemoryStore = {
  users: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Alexander Vance (Owner)',
      email: 'alex.vance@vaultkeep-demo.internal',
      password_hash: '$2a$10$nybYQdcGqdxTZrmsHyfhOOy9rSUYd1f0WvrFR2L6j.LNoTFjPmmNG', // 'Password123!'
      role: 'OWNER',
      account_status: 'ACTIVE',
      contact_verified: true,
      last_check_in_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Eleanor Vance (Nominee)',
      email: 'eleanor.nominee@vaultkeep-demo.internal',
      password_hash: '$2a$10$nybYQdcGqdxTZrmsHyfhOOy9rSUYd1f0WvrFR2L6j.LNoTFjPmmNG', // 'Password123!'
      role: 'NOMINEE',
      account_status: 'ACTIVE',
      contact_verified: true,
      last_check_in_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Security Officer Marcus (Admin)',
      email: 'admin.operator@vaultkeep-demo.internal',
      password_hash: '$2a$10$nybYQdcGqdxTZrmsHyfhOOy9rSUYd1f0WvrFR2L6j.LNoTFjPmmNG', // 'Password123!'
      role: 'ADMIN',
      account_status: 'ACTIVE',
      contact_verified: true,
      last_check_in_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  ],
  owner_settings: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      owner_id: '11111111-1111-1111-1111-111111111111',
      check_in_interval_days: 90,
      grace_period_days: 7,
      warning_days: 5,
      reminder_email_enabled: true,
      reminder_sms_enabled: false,
      timezone: 'America/New_York',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  nominees: [
    {
      id: '55555555-5555-5555-5555-555555555555',
      owner_id: '11111111-1111-1111-1111-111111111111',
      nominee_user_id: '22222222-2222-2222-2222-222222222222',
      full_name: 'Eleanor Vance',
      email: 'eleanor.nominee@vaultkeep-demo.internal',
      phone: '+1-555-0199',
      relationship_type: 'Spouse',
      invitation_status: 'ACCEPTED',
      invitation_token_hash: null,
      invitation_expires_at: null,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  documents: [],
  document_release_rules: [],
  check_ins: [],
  account_lifecycle: [
    {
      id: '66666666-6666-6666-6666-666666666666',
      owner_id: '11111111-1111-1111-1111-111111111111',
      current_state: 'ACTIVE',
      last_successful_check_in: new Date().toISOString(),
      next_check_in_deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      flagged_inactive_at: null,
      grace_period_ends_at: null,
      release_execution_state: 'NONE',
      state_transition_reason: 'Account initialized',
      updated_at: new Date().toISOString()
    }
  ],
  release_grants: [],
  notifications: [],
  audit_logs: [
    {
      id: uuidv4(),
      actor_id: '11111111-1111-1111-1111-111111111111',
      actor_email: 'alex.vance@vaultkeep-demo.internal',
      actor_role: 'OWNER',
      action: 'SYSTEM_BOOTSTRAP',
      resource_type: 'SYSTEM',
      resource_id: 'INIT',
      outcome: 'SUCCESS',
      ip_address: '127.0.0.1',
      user_agent: 'System/Init',
      correlation_id: uuidv4(),
      metadata: { description: 'VaultKeep seeded with synthetic demonstration data' },
      created_at: new Date().toISOString()
    }
  ],
  security_events: []
};

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const DB_FILE_DIR = path.resolve(__dirname, '../../data');
const DB_FILE_PATH = path.join(DB_FILE_DIR, 'vaultkeep_db.json');

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'vaultkeep-documents-327973843616-us-east-1';
const DB_BACKUP_KEY = 'database_backup/vaultkeep_db.json';

let s3Client: S3Client | null = null;
if (process.env.AWS_MOCK_SERVICES !== 'true') {
  s3Client = new S3Client({ region: AWS_REGION });
}

export async function syncDbToAwsS3() {
  if (!s3Client || process.env.AWS_MOCK_SERVICES === 'true') return;
  try {
    const raw = JSON.stringify(memoryStore, null, 2);
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: DB_BACKUP_KEY,
      Body: Buffer.from(raw, 'utf-8'),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256'
    }));
    console.log(`[AWS S3 Sync] Database state successfully backed up to s3://${S3_BUCKET}/${DB_BACKUP_KEY}`);
  } catch (err: any) {
    console.warn(`[AWS S3 Sync Warning] Failed to backup database to S3: ${err.message}`);
  }
}

export function saveMemoryDb() {
  try {
    if (!fs.existsSync(DB_FILE_DIR)) {
      fs.mkdirSync(DB_FILE_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(memoryStore, null, 2), 'utf-8');
    // Mirror update to AWS S3 in real time
    syncDbToAwsS3().catch(() => {});
  } catch (err: any) {
    console.warn('[DB Persistence Warning] Failed to save local db:', err.message);
  }
}

function applyParsedDb(parsed: any) {
  for (const key of Object.keys(parsed) as (keyof MemoryStore)[]) {
    if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
      if (key === 'users') {
        const userMap = new Map<string, any>();
        for (const u of memoryStore.users) {
          userMap.set(u.email.toLowerCase(), u);
        }
        for (const u of parsed.users) {
          userMap.set(u.email.toLowerCase(), u);
        }
        memoryStore.users = Array.from(userMap.values());
      } else {
        (memoryStore as any)[key] = parsed[key];
      }
    }
  }
}

function loadMemoryDb() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      applyParsedDb(parsed);
      console.log(`[DB Persistence] Successfully loaded ${memoryStore.users.length} users and ${memoryStore.nominees.length} nominees from persistent storage.`);
    } else {
      saveMemoryDb();
    }
  } catch (err: any) {
    console.warn('[DB Persistence Warning] Failed to load local db:', err.message);
  }
}

loadMemoryDb();
// Trigger initial S3 sync
syncDbToAwsS3().catch(() => {});

export const memoryDb = memoryStore;

/**
 * Universal Query Execution
 * Executes directly against Amazon RDS PostgreSQL pool.
 * Only falls back to transactional memory engine if USE_IN_MEMORY_DB=true is explicitly set.
 */
export async function query(text: string, params: any[] = []): Promise<QueryResult<any> | { rows: any[]; rowCount: number }> {
  if (pool && process.env.USE_IN_MEMORY_DB !== 'true') {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (err: any) {
      console.error(`[Amazon RDS PostgreSQL Query Error] Failed to execute: "${text.substring(0, 80)}..."`, err.message);
      throw err;
    }
  }

  if (process.env.USE_IN_MEMORY_DB === 'true') {
    return executeInMemoryQuery(text, params);
  }

  throw new Error('[Database Error] Amazon RDS PostgreSQL pool is not connected and in-memory DB is disabled.');
}

/**
 * In-Memory Query Router for common entities
 */
function executeInMemoryQuery(sql: string, params: any[]): { rows: any[]; rowCount: number } {
  const normalized = sql.trim().toUpperCase();
  const lowerSql = sql.trim().toLowerCase();

  // Handle SELECTs
  if (normalized.startsWith('SELECT')) {
    for (const table of Object.keys(memoryStore) as (keyof MemoryStore)[]) {
      if (lowerSql.includes(`from ${table}`) || lowerSql.includes(`from "${table}"`)) {
        let items = [...(memoryStore[table] as any[])];

        // Specific WHERE lookups
        if (lowerSql.includes('where id = $1') && params.length >= 1) {
          items = items.filter(i => i.id === params[0]);
        } else if (lowerSql.includes('where email = $1') && params.length >= 1) {
          items = items.filter(i => i.email.toLowerCase() === String(params[0]).toLowerCase());
        } else if (lowerSql.includes('where owner_id = $1') && params.length >= 1) {
          items = items.filter(i => i.owner_id === params[0]);
        } else if (lowerSql.includes('where nominee_user_id = $1') && params.length >= 1) {
          items = items.filter(i => i.nominee_user_id === params[0]);
        } else if (lowerSql.includes('where invitation_token_hash = $1') && params.length >= 1) {
          items = items.filter(i => i.invitation_token_hash === params[0]);
        }

        return { rows: items, rowCount: items.length };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // Handle INSERTs
  if (normalized.startsWith('INSERT INTO')) {
    for (const table of Object.keys(memoryStore) as (keyof MemoryStore)[]) {
      if (lowerSql.includes(`insert into ${table}`) || lowerSql.includes(`insert into "${table}"`)) {
        const newRecord: any = { id: params[0] || uuidv4(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        (memoryStore[table] as any[]).push(newRecord);
        return { rows: [newRecord], rowCount: 1 };
      }
    }
  }

  return { rows: [], rowCount: 0 };
}

export default {
  query,
  pool,
  memoryStore
};
