# VaultKeep Team Work Division & Responsibility Matrix

In accordance with Master Project Specification Section 19, the implementation was divided across a three-person engineering team with explicit separation of responsibilities and integration checkpoints.

---

## 1. Team Role Allocation

### Person 1 — Frontend & User Workflows
- **Primary Domain**: React.js, Vite, TypeScript, UI/UX Design System, Client State Management.
- **Completed Deliverables**:
  - `frontend/src/styles/theme.css`: Accessible Light (`#F5F8FC`) and Dark (`#0B1220`) design tokens.
  - `frontend/src/components/`: Navigation bar, modal dialogs, status badges, statistics cards.
  - `frontend/src/pages/`:
    - Public: Landing page with architectural pillars, Register and Login with quick demo buttons.
    - Owner: Owner Dashboard, Encrypted Document Vault, Nominee Directory, Inactivity Policy, Release Rules, Audit Trail.
    - Nominee: Nominee Portal, Released Documents view with Decrypt & Download action, Access History.
    - Operator: Admin Operational Health & AWS Services Justification Console.
  - `frontend/src/services/api.ts`: Strongly typed REST client communicating with Express backend.

---

### Person 2 — Backend, Database & Cryptography
- **Primary Domain**: Node.js, Express.js, PostgreSQL, AWS KMS, Cryptographic Engineering, Unit Testing.
- **Completed Deliverables**:
  - `backend/src/server.ts`: Express API server with security headers, CORS, rate limiting, and `/health` probes.
  - `backend/src/crypto/envelopeEncryption.ts`: Authenticated AES-256-GCM envelope encryption, DEK generation, and explicit runtime memory wiping (`plaintextDek.fill(0)`).
  - `backend/src/db/`: 11-table normalized PostgreSQL schema migrations (`001_initial_schema.sql`), synthetic seed data (`002_synthetic_seed.sql`), and connection pooling with transactional in-memory fallback.
  - `backend/src/services/lifecycleService.ts`: Inactivity detection state machine, deadline calculations, grace period safeguard abort, and idempotent release grant generation.
  - `backend/tests/verify_vaultkeep.js`: 15-test automated verification suite verifying 100% cryptographic and lifecycle compliance.

---

### Person 3 — AWS Infrastructure & Serverless Automation
- **Primary Domain**: Cloud Networking, AWS CloudFormation, Serverless Automation, Observability, Cost Governance.
- **Completed Deliverables**:
  - `infrastructure/cloudformation/01_vpc_network.yaml`: Custom VPC (`10.0.0.0/16`), 2 public subnets, 2 private app subnets, 2 private DB subnets, Internet Gateway, route tables, least-privilege security groups.
  - `infrastructure/cloudformation/02_kms_s3.yaml`: AWS KMS Customer Managed Key (CMK), Alias `alias/vaultkeep-master-key`, and private S3 bucket with strict Block Public Access and SSE-KMS.
  - `infrastructure/cloudformation/03_rds_postgresql.yaml`: Amazon RDS PostgreSQL instance in private DB subnets.
  - `infrastructure/cloudformation/04_ec2_alb_asg.yaml`: Application Load Balancer, Target Group with `/health` checks, Launch Template, and Auto Scaling Group.
  - `infrastructure/cloudformation/05_serverless_automation.yaml`: Amazon EventBridge scheduled rule, AWS Lambda inactivity worker, Amazon SNS topics, and CloudWatch Alarm on `FailedDecryptionAttempts >= 3`.
  - `infrastructure/cloudformation/06_budgets.yaml`: AWS Budgets $10.00 / month cost threshold alert.

---

## 2. Integration & Shared Milestones

1. **API & Data Contract Alignment**: Frontend and backend agreed on normalized field naming, error formats, and UUID keys prior to parallel coding.
2. **End-to-End Cryptographic Flow**: Person 2's envelope encryption and S3 ciphertext persistence were integrated with Person 1's Document Vault and Person 3's KMS key policies.
3. **Inactivity Workflow Verification**: The team verified the full owner-to-nominee release flow: owner uploads encrypted file -> deadline expires -> grace period alerts published -> access granted -> nominee decrypts document -> CloudWatch audit logged.
