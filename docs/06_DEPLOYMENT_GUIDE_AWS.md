# VaultKeep AWS Cloud Deployment Guide

This guide details the end-to-end deployment of VaultKeep on Amazon Web Services using AWS CloudFormation and the AWS CLI.

---

## 1. Prerequisites for Cloud Deployment

1. An active AWS Account (e.g. AWS Academy Learner Lab or standard AWS Account).
2. AWS CLI v2 configured with valid credentials (`aws sts get-caller-identity`).
3. Targeted AWS Region: `us-east-1` (default) or any preferred region supporting KMS and RDS.

---

## 2. CloudFormation Stack Deployment Sequence

Deploy the templates located in `vaultkeep/infrastructure/cloudformation/` in the following order:

### Step 1: Deploy VPC Network Stack
Provisions the custom VPC (`10.0.0.0/16`), 2 public subnets, 2 private app subnets, 2 private db subnets, Internet Gateway, route tables, and least-privilege security groups.

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-vpc-stack \
  --template-body file://infrastructure/cloudformation/01_vpc_network.yaml \
  --region us-east-1
```
*Wait until stack status is `CREATE_COMPLETE`.*

### Step 2: Deploy KMS CMK & Private S3 Storage Stack
Provisions the AWS KMS Customer Managed Key, Alias `alias/vaultkeep-master-key`, and private S3 bucket with Block Public Access and SSE-KMS.

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-kms-s3-stack \
  --template-body file://infrastructure/cloudformation/02_kms_s3.yaml \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

### Step 3: Deploy Amazon RDS PostgreSQL Stack
Provisions the private DB subnet group and Amazon RDS PostgreSQL instance (`db.t4g.micro`, 20GB gp3, non-public).

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-rds-stack \
  --template-body file://infrastructure/cloudformation/03_rds_postgresql.yaml \
  --parameters ParameterKey=DBMasterPassword,ParameterValue="VaultKeepProductionPassword2026!" \
  --region us-east-1
```

### Step 4: Populate AWS Systems Manager Parameter Store
Store database and configuration secrets securely in SSM:

```bash
aws ssm put-parameter --name "/vaultkeep/prod/DB_HOST" --type "String" --value "<RDS_ENDPOINT>" --overwrite
aws ssm put-parameter --name "/vaultkeep/prod/DB_PASSWORD" --type "SecureString" --value "VaultKeepProductionPassword2026!" --overwrite
aws ssm put-parameter --name "/vaultkeep/prod/JWT_SECRET" --type "SecureString" --value "prod_super_secure_vaultkeep_key_2026" --overwrite
```

### Step 5: Deploy EC2, ALB, and Auto Scaling Group Stack
Provisions the IAM Instance Profile, Launch Template, Target Group, ALB, and Auto Scaling Group.

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-compute-stack \
  --template-body file://infrastructure/cloudformation/04_ec2_alb_asg.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Step 6: Deploy Serverless Automation & CloudWatch Alarms
Provisions Amazon SNS topics, EventBridge rule (`rate(1 day)`), supporting AWS Lambda inactivity worker, and CloudWatch Failed Decryption Alarm.

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-automation-stack \
  --template-body file://infrastructure/cloudformation/05_serverless_automation.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Step 7: Deploy AWS Budgets
Provisions monthly cost alerts for academic budget governance:

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-budgets-stack \
  --template-body file://infrastructure/cloudformation/06_budgets.yaml \
  --region us-east-1
```

---

## 3. Post-Deployment Verification

1. **Verify ALB Health**:
   Query the ALB DNS Name: `http://<ALB-DNS-NAME>/health`. You should receive HTTP 200 with `{ "status": "UP" }`.
2. **Execute Database Migrations on EC2**:
   Connect to the EC2 instance via AWS Systems Manager Session Manager and run:
   ```bash
   cd /opt/vaultkeep/backend
   npm run migrate
   ```
3. **Verify CloudWatch Alarms**:
   Inspect the CloudWatch console to confirm `VaultKeep-FailedDecryption-SecurityAlarm` is active and monitoring metric `FailedDecryptionAttempts`.
