# VaultKeep AWS Cost Estimation & Budget Governance

This document presents a realistic, transparent monthly cost breakdown for deploying VaultKeep in the AWS `us-east-1` region, tailored specifically for student and academic demonstration budgets.

---

## 1. Cost Breakdown by AWS Service

| Service | Configuration | Usage Assumptions | Estimated Monthly Cost (USD) |
| :--- | :--- | :--- | :--- |
| **Amazon EC2** | 1 x `t3.micro` Instance (Linux) | 730 hours / month (Persistent Compute) | \$7.49 |
| **Amazon EBS** | 20 GB gp3 General Purpose SSD | Root operating system volume | \$1.60 |
| **Application Load Balancer** | 1 ALB | 730 hours + 0.5 LCU / month | \$16.20 |
| **Amazon RDS (PostgreSQL)** | Single-AZ `db.t4g.micro` + 20 GB gp3 | Metadata store (Non-Multi-AZ for dev) | \$12.80 |
| **Amazon S3** | Standard Tier Storage | 5 GB synthetic ciphertext + 1,000 PUT/GETs | \$0.12 |
| **AWS KMS** | 1 Customer Managed Key (CMK) | 1 key per month + ~5,000 cryptographic calls | \$1.15 |
| **Amazon EventBridge** | 1 Scheduled Rule | 30 triggers / month (rate: 1 day) | Free Tier ($0.00) |
| **AWS Lambda** | 256 MB memory, 60s timeout | 30 invocations / month | Free Tier ($0.00) |
| **Amazon SNS** | 2 Topics | < 500 email / SMS notification deliveries | Free Tier ($0.00) |
| **Amazon CloudWatch** | Logs (1 GB) + 1 Custom Metric + 1 Alarm | 1 active alarm on `FailedDecryptionAttempts` | \$0.60 |
| **AWS Budgets** | 1 Cost Budget | 2 notification thresholds | Free Tier ($0.00) |
| **Total Estimated Spend** | **Full Continuous Cloud Deployment** | **~ \$39.96 / month** |

*Note: For academic viva demonstrations that run for a few hours or days, total actual spend is typically under \$2.00 to \$5.00.*

---

## 2. Key Cost-Optimization Decisions

1. **Avoided NAT Gateway**: Managed NAT Gateways in AWS incur a fixed charge of \$32.40/month per AZ plus data transfer fees (\$64.80 for 2 AZs). Instead, our architecture places persistent compute in subnets with controlled egress or utilizes VPC Endpoints, saving over \$60/month.
2. **Single-AZ RDS**: We deliberately configured Multi-AZ to `false` for development and demonstration. Multi-AZ doubles RDS hourly costs and is only necessary in production high-availability environments.
3. **Small Compute Instance Sizing**: `t3.micro` (EC2) and `db.t4g.micro` (RDS Graviton2) provide sufficient performance for demonstration workloads while remaining in the lowest cost tier.
4. **Local Zero-Cost Simulator**: When testing locally without cloud credentials, `AWS_MOCK_SERVICES=true` simulates KMS and S3 with zero external cloud charges.

---

## 3. AWS Budgets Configuration

VaultKeep includes a dedicated CloudFormation template (`infrastructure/cloudformation/06_budgets.yaml`) that configures:
- **Monthly Spending Limit**: \$10.00 USD
- **Threshold 1 (Actual)**: Email alert dispatched when actual charges exceed **80%** (\$8.00).
- **Threshold 2 (Forecasted)**: Email alert dispatched when projected month-end spend exceeds **100%** (\$10.00).
