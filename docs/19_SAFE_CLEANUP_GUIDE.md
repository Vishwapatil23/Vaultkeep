# VaultKeep Safe Resource Teardown & Cloud Cleanup Guide

To prevent unnecessary AWS cloud charges after completing your evaluation or academic demonstration, follow this step-by-step decommissioning guide.

---

## 1. Cloud Decommissioning Order

Delete the CloudFormation stacks in **reverse dependency order** using the AWS CLI or AWS Management Console:

### Step 1: Empty and Delete the Amazon S3 Bucket
Amazon S3 prevents stack deletion if the bucket holds ciphertext objects. Empty the bucket first:
```bash
# 1. Remove all objects
aws s3 rm s3://vaultkeep-encrypted-documents-<ACCOUNT-ID> --recursive

# 2. If versioning is enabled, remove all object versions
aws s3api delete-objects --bucket vaultkeep-encrypted-documents-<ACCOUNT-ID> \
  --delete "$(aws s3api list-object-versions --bucket vaultkeep-encrypted-documents-<ACCOUNT-ID> \
  --query='{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json)"
```

### Step 2: Delete Automation & Budgets Stacks
```bash
aws cloudformation delete-stack --stack-name vaultkeep-budgets-stack --region us-east-1
aws cloudformation delete-stack --stack-name vaultkeep-automation-stack --region us-east-1
```

### Step 3: Delete Compute & Load Balancer Stack
Deletes the Auto Scaling Group, EC2 instances, and Application Load Balancer:
```bash
aws cloudformation delete-stack --stack-name vaultkeep-compute-stack --region us-east-1
```
*Wait until `vaultkeep-compute-stack` is completely removed.*

### Step 4: Delete Amazon RDS PostgreSQL Stack
Deletes the private PostgreSQL database instance:
```bash
aws cloudformation delete-stack --stack-name vaultkeep-rds-stack --region us-east-1
```

### Step 5: Delete KMS & S3 Storage Stack
Schedules the KMS Customer Managed Key for deletion (minimum 7-day waiting window enforced by AWS KMS):
```bash
aws cloudformation delete-stack --stack-name vaultkeep-kms-s3-stack --region us-east-1
```

### Step 6: Delete VPC Network Stack
Deletes subnets, route tables, security groups, and the VPC:
```bash
aws cloudformation delete-stack --stack-name vaultkeep-vpc-stack --region us-east-1
```

---

## 2. Post-Cleanup Verification Checklist

Verify in the AWS Console that:
- [ ] No EC2 instances are in `running` state.
- [ ] No Application Load Balancers are provisioned.
- [ ] No Amazon RDS DB instances are active.
- [ ] No S3 buckets remain active for VaultKeep.
- [ ] No active CloudWatch Alarms are incurring metric charges.
- [ ] AWS Budgets dashboard displays projected spend at \$0.00.
