-- Migration 003: Store active invitation token for nominees to support reliable re-delivery and pending status integrity
ALTER TABLE nominees ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255);

-- Ensure any nominee with an active invitation token is marked PENDING until explicitly accepted
UPDATE nominees 
SET invitation_status = 'PENDING' 
WHERE invitation_token_hash IS NOT NULL AND invitation_status = 'ACCEPTED';

