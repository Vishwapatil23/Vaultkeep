-- Migration 004: Allow owner_id to be NULL for self-registered nominees and backfill existing nominee users
ALTER TABLE nominees ALTER COLUMN owner_id DROP NOT NULL;

-- Ensure a partial unique index exists so each registered nominee without an owner has at most one standalone record
CREATE UNIQUE INDEX IF NOT EXISTS uq_nominees_standalone_email 
ON nominees (LOWER(email)) 
WHERE owner_id IS NULL;

-- Backfill any existing registered users with role 'NOMINEE' who are not yet in nominees table
INSERT INTO nominees (
  id, owner_id, nominee_user_id, full_name, email,
  relationship_type, invitation_status, verified_at, created_at, updated_at
)
SELECT 
  uuid_generate_v4(),
  NULL,
  u.id,
  u.name,
  u.email,
  'Family',
  'ACCEPTED',
  u.created_at,
  u.created_at,
  NOW()
FROM users u
WHERE u.role = 'NOMINEE'
  AND NOT EXISTS (
    SELECT 1 FROM nominees n WHERE LOWER(n.email) = LOWER(u.email)
  );

-- Link any nominee records that match existing users where nominee_user_id was still NULL
UPDATE nominees n
SET nominee_user_id = u.id,
    updated_at = NOW()
FROM users u
WHERE LOWER(n.email) = LOWER(u.email)
  AND n.nominee_user_id IS NULL;

