data "aws_caller_identity" "current" {}

resource "aws_kms_key" "vaultkeep_key" {
  description             = "VaultKeep Customer Managed Key for Document Envelope Encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootPermissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCryptoOperations"
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "kms:GenerateDataKey",
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

resource "aws_kms_alias" "vaultkeep_alias" {
  name          = "alias/vaultkeep-master-key"
  target_key_id = aws_kms_key.vaultkeep_key.key_id
}

resource "aws_s3_bucket" "vault_storage" {
  bucket = "vaultkeep-encrypted-documents-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vault_sse" {
  bucket = aws_s3_bucket.vault_storage.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.vaultkeep_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "block_public" {
  bucket = aws_s3_bucket.vault_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "versioning" {
  bucket = aws_s3_bucket.vault_storage.id
  versioning_configuration {
    status = "Enabled"
  }
}
