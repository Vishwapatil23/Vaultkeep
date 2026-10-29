import { Pool, QueryResult } from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const isPgConfigured = !process.env.USE_IN_MEMORY_DB || process.env.USE_IN_MEMORY_DB === 'false';

let pool: Pool | null = null;

if (isPgConfigured) {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'vaultkeep_db',
    user: process.env.DB_USER || 'vaultkeep_user',
    password: process.env.DB_PASSWORD || 'vaultkeep_secure_dev_password',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.warn('[PostgreSQL Pool Warning]', err.message);
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
      password_hash: '$2a$10$V4tQT6FvN/3KOqtCHJih0eaMnshCZ3egQJpkwt005c/vtZFEUOwoG', // 'Password123!'
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
      password_hash: '$2a$10$V4tQT6FvN/3KOqtCHJih0eaMnshCZ3egQJpkwt005c/vtZFEUOwoG', // 'Password123!'
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
      password_hash: '$2a$10$V4tQT6FvN/3KOqtCHJih0eaMnshCZ3egQJpkwt005c/vtZFEUOwoG', // 'Password123!'
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

export const memoryDb = memoryStore;

/**
 * Universal Query Execution
 * If PostgreSQL pool is active and operational, uses RDS/PostgreSQL.
 * Otherwise, falls back to the transactional memory engine.
 */
export async function query(text: string, params: any[] = []): Promise<QueryResult<any> | { rows: any[]; rowCount: number }> {
  if (pool && !process.env.FORCE_MEMORY_DB) {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (err: any) {
      // Fallback to memory store if pg connection refused
      if (err.code === 'ECONNREFUSED' || err.message.includes('connect ECONNREFUSED')) {
        return executeInMemoryQuery(text, params);
      }
      throw err;
    }
  }
  return executeInMemoryQuery(text, params);
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
