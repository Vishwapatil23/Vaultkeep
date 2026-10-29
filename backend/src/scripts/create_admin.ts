/**
 * VaultKeep Administrative Provisioning Script
 * Provisions authorized ADMIN accounts directly into Amazon RDS PostgreSQL.
 * Usage:
 *   npx tsx src/scripts/create_admin.ts <name> <email> <password>
 * Or pass via environment variables:
 *   ADMIN_NAME="..." ADMIN_EMAIL="..." ADMIN_PASSWORD="..." npx tsx src/scripts/create_admin.ts
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';

dotenv.config();

async function createAdmin() {
  const name = process.argv[2] || process.env.ADMIN_NAME;
  const email = process.argv[3] || process.env.ADMIN_EMAIL;
  const password = process.argv[4] || process.env.ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error('Usage: npx tsx src/scripts/create_admin.ts "<Full Name>" "<email@domain.com>" "<SecurePassword>"');
    console.error('Or set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    console.error('Error: Invalid email address format.');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('Error: Admin passwords must be at least 12 characters long.');
    process.exit(1);
  }

  console.log(`[Admin Provisioning] Checking existing user for email: ${normalizedEmail}...`);
  const existing = await query('SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
  if (existing.rows && existing.rows.length > 0) {
    console.error(`Error: User with email ${normalizedEmail} already exists with role ${existing.rows[0].role}.`);
    process.exit(1);
  }

  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);
  const passwordHash = await bcrypt.hash(password, saltRounds);
  const userId = uuidv4();
  const now = new Date();

  console.log(`[Admin Provisioning] Inserting ADMIN user ${userId} into PostgreSQL...`);
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, account_status, contact_verified, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIVE', true, $5, $6)`,
    [userId, name.trim(), normalizedEmail, passwordHash, now, now]
  );

  console.log('========================================================');
  console.log(' [SUCCESS] Admin user provisioned successfully in RDS:');
  console.log(`   ID:    ${userId}`);
  console.log(`   Name:  ${name.trim()}`);
  console.log(`   Email: ${normalizedEmail}`);
  console.log(`   Role:  ADMIN`);
  console.log('========================================================');
  process.exit(0);
}

createAdmin().catch((err) => {
  console.error('[Admin Provisioning Failed]', err);
  process.exit(1);
});

