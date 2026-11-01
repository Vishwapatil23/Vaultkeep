-- Migration 005: Synchronize release_grants from all active document_release_rules
INSERT INTO release_grants (id, owner_id, nominee_id, nominee_user_id, document_id, rule_id, grant_status, granted_at, expires_at, created_at)
SELECT 
  uuid_generate_v4(),
  r.owner_id,
  r.nominee_id,
  n.nominee_user_id,
  r.document_id,
  r.id,
  'ACTIVE',
  COALESCE(r.confirmed_at, r.created_at, NOW()),
  CASE 
    WHEN r.access_duration_days IS NOT NULL THEN (COALESCE(r.confirmed_at, r.created_at, NOW()) + (r.access_duration_days || ' days')::interval)
    ELSE NULL
  END,
  NOW()
FROM document_release_rules r
JOIN nominees n ON n.id = r.nominee_id
WHERE r.rule_status = 'ACTIVE'
ON CONFLICT (nominee_id, document_id) 
DO UPDATE SET 
  rule_id = EXCLUDED.rule_id,
  grant_status = 'ACTIVE',
  expires_at = EXCLUDED.expires_at,
  granted_at = EXCLUDED.granted_at;

