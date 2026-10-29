-- Update notifications delivery_status check constraint to support PENDING_SNS_CONFIRMATION
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_delivery_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_delivery_status_check CHECK (delivery_status IN ('CREATED', 'PUBLISHED', 'PROVIDER_ACCEPTED', 'DELIVERED', 'FAILED', 'PENDING_SNS_CONFIRMATION'));
