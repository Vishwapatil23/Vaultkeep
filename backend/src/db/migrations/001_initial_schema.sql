-- VaultKeep Master Database Schema (PostgreSQL)
-- Version: 1.0.0
-- Compliant with Master Project Specification Section 10

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'NOMINEE', 'ADMIN')),
    account_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    contact_verified BOOLEAN NOT NULL DEFAULT false,
    last_check_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. OWNER SETTINGS
CREATE TABLE IF NOT EXISTS owner_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in_interval_days INTEGER NOT NULL DEFAULT 30 CHECK (check_in_interval_days >= 1 AND check_in_interval_days <= 365),
    grace_period_days INTEGER NOT NULL DEFAULT 7 CHECK (grace_period_days >= 1 AND grace_period_days <= 90),
    warning_days INTEGER NOT NULL DEFAULT 5 CHECK (warning_days >= 1 AND warning_days <= 30),
    reminder_email_enabled BOOLEAN NOT NULL DEFAULT true,
    reminder_sms_enabled BOOLEAN NOT NULL DEFAULT false,
    phone_number VARCHAR(50),
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_owner_settings UNIQUE (owner_id)
);

-- 3. NOMINEES
CREATE TABLE IF NOT EXISTS nominees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nominee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    relationship_type VARCHAR(100) NOT NULL DEFAULT 'Family',
    invitation_token_hash VARCHAR(255),
    invitation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (invitation_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED')),
    invitation_expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_owner_nominee_email UNIQUE (owner_id, email)
);

CREATE INDEX IF NOT EXISTS idx_nominees_owner_id ON nominees(owner_id);
CREATE INDEX IF NOT EXISTS idx_nominees_email ON nominees(email);
CREATE INDEX IF NOT EXISTS idx_nominees_token_hash ON nominees(invitation_token_hash);

-- 4. DOCUMENTS (Ciphertext stored in S3; Metadata and KMS-wrapped DEK stored here)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(512) NOT NULL UNIQUE,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'PERSONAL' CHECK (category IN ('FINANCIAL', 'LEGAL', 'PERSONAL', 'CREDENTIALS', 'OTHER')),
    upload_status VARCHAR(50) NOT NULL DEFAULT 'UPLOADED' CHECK (upload_status IN ('UPLOADED', 'ARCHIVED', 'DELETED')),
    encryption_algorithm VARCHAR(64) NOT NULL DEFAULT 'AES-256-GCM',
    encryption_version VARCHAR(32) NOT NULL DEFAULT 'v1',
    kms_key_id VARCHAR(512) NOT NULL,
    encrypted_dek_base64 TEXT NOT NULL,
    dek_iv_base64 VARCHAR(128) NOT NULL,
    auth_tag_base64 VARCHAR(128) NOT NULL,
    checksum_sha256 VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(upload_status);

-- 5. DOCUMENT RELEASE RULES
CREATE TABLE IF NOT EXISTS document_release_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    nominee_id UUID NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    rule_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (rule_status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    access_duration_days INTEGER, -- NULL means indefinite access
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_doc_nominee_rule UNIQUE (document_id, nominee_id)
);

CREATE INDEX IF NOT EXISTS idx_release_rules_owner ON document_release_rules(owner_id);
CREATE INDEX IF NOT EXISTS idx_release_rules_nominee ON document_release_rules(nominee_id);

-- 6. CHECK-INS
CREATE TABLE IF NOT EXISTS check_ins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    check_in_type VARCHAR(64) NOT NULL DEFAULT 'MANUAL_DASHBOARD',
    ip_address VARCHAR(64),
    user_agent TEXT,
    next_deadline_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_check_ins_owner ON check_ins(owner_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_timestamp ON check_ins(check_in_timestamp DESC);

-- 7. ACCOUNT LIFECYCLE
CREATE TABLE IF NOT EXISTS account_lifecycle (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_state VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (current_state IN ('ACTIVE', 'CHECK_IN_DUE', 'INACTIVE_PENDING', 'GRACE_PERIOD', 'RELEASE_READY', 'ACCESS_GRANTED', 'CANCELLED', 'SUSPENDED', 'CLOSED')),
    last_successful_check_in TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_check_in_deadline TIMESTAMPTZ NOT NULL,
    flagged_inactive_at TIMESTAMPTZ,
    grace_period_ends_at TIMESTAMPTZ,
    release_execution_state VARCHAR(50) NOT NULL DEFAULT 'NONE' CHECK (release_execution_state IN ('NONE', 'SCHEDULED', 'EXECUTED', 'FAILED')),
    state_transition_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_lifecycle UNIQUE (owner_id)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_state ON account_lifecycle(current_state);
CREATE INDEX IF NOT EXISTS idx_lifecycle_deadline ON account_lifecycle(next_check_in_deadline);

-- 8. RELEASE GRANTS
CREATE TABLE IF NOT EXISTS release_grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nominee_id UUID NOT NULL REFERENCES nominees(id) ON DELETE CASCADE,
    nominee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES document_release_rules(id) ON DELETE CASCADE,
    grant_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (grant_status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_release_grant UNIQUE (nominee_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_release_grants_nominee ON release_grants(nominee_id);
CREATE INDEX IF NOT EXISTS idx_release_grants_document ON release_grants(document_id);

-- 9. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_role VARCHAR(50) NOT NULL DEFAULT 'NOMINEE',
    notification_type VARCHAR(64) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_reference_id UUID,
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'CREATED' CHECK (delivery_status IN ('CREATED', 'PUBLISHED', 'PROVIDER_ACCEPTED', 'DELIVERED', 'FAILED')),
    provider_message_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id);

-- 10. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    outcome VARCHAR(50) NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED')),
    ip_address VARCHAR(64),
    user_agent TEXT,
    correlation_id VARCHAR(128),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 11. SECURITY EVENTS
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    actor_email VARCHAR(255),
    ip_address VARCHAR(64),
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sec_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_created ON security_events(created_at DESC);
