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

### Step 3: Populate Secure Secrets in Parameter Store & Deploy Amazon RDS Stack

Before deploying, generate high-entropy secrets and store them directly in AWS Systems Manager Parameter Store. Never use static or hardcoded credentials in deployment scripts.

```bash
# 1. Generate strong, unique secrets for the deployment
export DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9!$%*_-' | head -c 24)
export JWT_SECRET_VAL=$(openssl rand -hex 32)

# 2. Securely store secrets in SSM Parameter Store (encrypted with AWS KMS)
aws ssm put-parameter \
  --name "/vaultkeep/prod/db_password" \
  --type "SecureString" \
  --value "$DB_PASSWORD" \
  --description "VaultKeep RDS Master Database Password" \
  --overwrite

aws ssm put-parameter \
  --name "/vaultkeep/prod/JWT_SECRET" \
  --type "SecureString" \
  --value "$JWT_SECRET_VAL" \
  --description "VaultKeep JWT Signing Key" \
  --overwrite
```

Now deploy the RDS PostgreSQL stack, supplying the generated password parameter securely:

```bash
aws cloudformation create-stack \
  --stack-name vaultkeep-rds-stack \
  --template-body file://infrastructure/cloudformation/03_rds_postgresql.yaml \
  --parameters ParameterKey=DBMasterPassword,ParameterValue="$DB_PASSWORD" \
  --region us-east-1
```
*(When deploying via Terraform, pass the variable dynamically: `export TF_VAR_db_password="$DB_PASSWORD"` or `terraform apply -var="db_password=$DB_PASSWORD"`).*

### Step 4: Record RDS Endpoint in Parameter Store
Once the RDS stack is created, retrieve its endpoint address and record it in SSM:

```bash
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier vaultkeep-postgresql-db \
  --query "DBInstances[0].Endpoint.Address" \
  --output text \
  --region us-east-1)

aws ssm put-parameter \
  --name "/vaultkeep/prod/DB_HOST" \
  --type "String" \
  --value "$RDS_ENDPOINT" \
  --description "VaultKeep RDS Endpoint Address" \
  --overwrite
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

### Step 6: Package and Deploy Serverless Automation & CloudWatch Alarms
Packages the production Lambda handler (`infrastructure/lambda/inactivity_handler.js`) bundled with the RDS CA certificate bundle (`rds-ca-bundle.pem`) and production dependencies (`pg`), stages the artifact in the S3 bucket, and deploys the CloudFormation automation stack:

```bash
# 1. Package the Lambda inactivity handler with RDS CA bundle and dependencies
node infrastructure/lambda/package_worker.js

# 2. Retrieve the VaultKeep S3 bucket name created in Step 2
S3_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name vaultkeep-kms-s3-stack \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" \
  --output text \
  --region us-east-1)

# 3. Stage the packaged zip in the S3 bucket
aws s3 cp infrastructure/lambda/inactivity_worker.zip "s3://${S3_BUCKET}/lambda/inactivity_worker.zip" --region us-east-1

# 4. Deploy the CloudFormation automation stack
aws cloudformation create-stack \
  --stack-name vaultkeep-automation-stack \
  --template-body file://infrastructure/cloudformation/05_serverless_automation.yaml \
  --parameters ParameterKey=LambdaCodeBucket,ParameterValue="${S3_BUCKET}" ParameterKey=LambdaCodeKey,ParameterValue="lambda/inactivity_worker.zip" \
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
