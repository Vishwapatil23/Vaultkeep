variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS Region for deployment"
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Deployment environment name"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "VPC CIDR block"
}

variable "db_username" {
  type        = string
  default     = "vaultkeep_admin"
  description = "RDS master username"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Amazon RDS master password (must be provided securely at runtime via TF_VAR_db_password or CLI var)"
}

variable "budget_amount" {
  type        = string
  default     = "10.0"
  description = "Monthly budget limit in USD"
}

variable "alert_email" {
  type        = string
  default     = "alerts@vaultkeep-demo.internal"
  description = "Email destination for budget and alarm notifications"
}
