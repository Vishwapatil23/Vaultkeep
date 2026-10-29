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

output "lambda_security_group_id" {
  value       = aws_security_group.lambda_sg.id
  description = "Security group ID for Inactivity Worker Lambda"
}

output "nat_gateway_public_ip" {
  value       = aws_eip.nat.public_ip
  description = "Public IP of the NAT Gateway for private subnet outbound traffic"
}

output "private_route_table_id" {
  value       = aws_route_table.private.id
  description = "ID of the private route table routed to NAT Gateway"
}

output "vpc_endpoint_ssm_id" {
  value       = aws_vpc_endpoint.ssm.id
  description = "ID of the Systems Manager Interface VPC Endpoint"
}

output "vpc_endpoint_sns_id" {
  value       = aws_vpc_endpoint.sns.id
  description = "ID of the SNS Interface VPC Endpoint"
}

output "vpc_endpoint_kms_id" {
  value       = aws_vpc_endpoint.kms.id
  description = "ID of the KMS Interface VPC Endpoint"
}
