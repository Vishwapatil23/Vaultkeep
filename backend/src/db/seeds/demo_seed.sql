-- VaultKeep Synthetic Demonstration Seed Data
-- Compliant with Spec: Uses only synthetic demonstration documents and test identities.

-- 1. Synthetic Users (Passwords: 'Password123!')
-- bcrypt hash for 'Password123!': $2a$10$nybYQdcGqdxTZrmsHyfhOOy9rSUYd1f0WvrFR2L6j.LNoTFjPmmNG
-- Synthetic Demonstration Users (Owner and Nominee test identities only)
-- Admin accounts are NEVER seeded with shared passwords. Provision admins separately via administrative tools.
INSERT INTO users (id, name, email, password_hash, role, account_status, contact_verified, last_check_in_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Alexander Vance (Synthetic Owner)', 'alex.vance@vaultkeep-demo.internal', '$2a$10$nybYQdcGqdxTZrmsHyfhOOy9rSUYd1f0WvrFR2L6j.LNoTFjPmmNG', 'OWNER', 'ACTIVE', true, CURRENT_TIMESTAMP),
    ('22222222-2222-2222-2222-222222222222', 'Eleanor Vance (Synthetic Nominee)', 'eleanor.nominee@vaultkeep-demo.internal', '$2a$10$nybYQdcGqdxTZrmsHyfhOOy9rSUYd1f0WvrFR2L6j.LNoTFjPmmNG', 'NOMINEE', 'ACTIVE', true, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 2. Owner Settings for Alexander
INSERT INTO owner_settings (id, owner_id, check_in_interval_days, grace_period_days, warning_days, reminder_email_enabled, reminder_sms_enabled, timezone)
VALUES 
    ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 30, 7, 5, true, false, 'America/New_York')
ON CONFLICT (owner_id) DO NOTHING;

-- 3. Nominees for Alexander
INSERT INTO nominees (id, owner_id, nominee_user_id, full_name, email, phone, relationship_type, invitation_status, verified_at)
VALUES 
    ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Eleanor Vance', 'eleanor.nominee@vaultkeep-demo.internal', '+1-555-0199', 'Spouse', 'ACCEPTED', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- 4. Initial Lifecycle Record (Next deadline in 30 days)
INSERT INTO account_lifecycle (id, owner_id, current_state, last_successful_check_in, next_check_in_deadline, release_execution_state)
VALUES 
    ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', 'NONE')
ON CONFLICT (owner_id) DO NOTHING;

-- 5. Synthetic Audit Logs for initial seed
INSERT INTO audit_logs (id, actor_id, actor_email, actor_role, action, resource_type, resource_id, outcome, metadata)
VALUES 
    (uuid_generate_v4(), '11111111-1111-1111-1111-111111111111', 'alex.vance@vaultkeep-demo.internal', 'OWNER', 'ACCOUNT_INITIALIZED', 'USER', '11111111-1111-1111-1111-111111111111', 'SUCCESS', '{"notes": "Synthetic demonstration account initialized"}'),
    (uuid_generate_v4(), '11111111-1111-1111-1111-111111111111', 'alex.vance@vaultkeep-demo.internal', 'OWNER', 'NOMINEE_ACCEPTED', 'NOMINEE', '55555555-5555-5555-5555-555555555555', 'SUCCESS', '{"notes": "Nominee relationship established"}');
