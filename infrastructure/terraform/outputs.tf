output "alb_dns_name" {
  value       = aws_lb.alb.dns_name
  description = "Public DNS name of the Application Load Balancer"
}

output "s3_bucket_name" {
  value       = aws_s3_bucket.vault_storage.bucket
  description = "Name of the encrypted document S3 bucket"
}

output "kms_key_arn" {
  value       = aws_kms_key.vaultkeep_key.arn
  description = "ARN of the AWS KMS Customer Managed Key"
}

output "rds_endpoint" {
  value       = aws_db_instance.postgresql.endpoint
  description = "Private endpoint for Amazon RDS PostgreSQL"
}

output "inactivity_sns_topic_arn" {
  value       = aws_sns_topic.inactivity_alerts.arn
  description = "ARN for the inactivity alerts SNS topic"
}

output "access_granted_sns_topic_arn" {
  value       = aws_sns_topic.access_granted.arn
  description = "ARN for the access granted SNS topic"
}
