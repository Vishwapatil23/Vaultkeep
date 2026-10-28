# VaultKeep: Cloud-Based Encrypted Digital Legacy & Nominee Access System

[![AWS Cloud](https://img.shields.io/badge/AWS-13%20Services-orange?logo=amazon-aws)](https://aws.amazon.com/)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18.3-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-RDS%2015-blue?logo=postgresql)](https://www.postgresql.org/)
[![KMS](https://img.shields.io/badge/Encryption-AWS%20KMS%20%2B%20AES--256--GCM-red)](https://aws.amazon.com/kms/)

> **A secure, cloud-native digital legacy platform that enables account owners to store sensitive personal documents, appoint trusted nominees, configure periodic check-ins, define an inactivity grace-period policy, and arrange conditional, time-delayed, fully audited access to explicitly selected documents if the owner remains inactive beyond the configured period.**

---

## Key Architectural Highlights

- **KMS Envelope Encryption**: All documents are encrypted in memory with a unique AES-256-GCM data key wrapped by AWS KMS Customer Managed Keys. Plaintext keys are wiped from runtime memory immediately (`plaintextDek.fill(0)`).
- **Amazon S3 Isolated Ciphertext**: Only authenticated ciphertext blobs are stored in S3 with strict Block Public Access.
- **Amazon RDS for PostgreSQL**: Relational metadata, user identities, hashed passwords (bcrypt), check-in history, and release rules are stored in private database subnets with zero internet route.
- **Persistent EC2 Compute behind ALB**: Node.js/Express API running in private application subnets behind an Application Load Balancer with continuous `/health` probes.
- **Scheduled Inactivity Automation**: Amazon EventBridge triggers an AWS Lambda inactivity worker daily to audit check-in deadlines, initiate grace periods, and generate release grants.
- **Grace Period Safeguard**: An owner check-in at ANY time during an active grace period safely aborts the pending release and restores active vault custody.
- **Granular Release Policies**: Nominees receive zero access by default; access is explicitly mapped per-document with optional time-bounded expiration.
- **Complete Audit Trail**: Chronological, immutable logging of all logins, uploads, check-ins, state transitions, and downloads.
- **AWS Budgets & CloudWatch**: Custom metrics (`FailedDecryptionAttempts`), security alarms, and a \$10.00/month cost alert.

---

## 30-Second Quickstart (Local Evaluation Mode)

VaultKeep includes a zero-dependency local simulator for AWS KMS, S3, and SNS so evaluators can run and test the complete system immediately without configuring cloud credentials.

### 1. Start the Backend
```bash
cd vaultkeep/backend
npm install
npm run dev
```
*Backend starts on `http://localhost:5000` with `/health` and `/ready` probes.*

### 2. Start the Frontend
```bash
cd vaultkeep/frontend
npm install
npm run dev
```
*Frontend opens on `http://localhost:5173`.*

### 3. Run Automated Tests
```bash
cd vaultkeep/backend
npm test
```
*Runs cryptographic envelope round-trip tests, authentication tests, and lifecycle state transition tests.*

---

## Demonstration Test Accounts (Viva & Evaluation)

The login screen includes one-click pre-fill buttons for synthetic demonstration identities:

| Role | Synthetic Name | Email Address | Password | Key Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Owner** | Alexander Vance | `alex.vance@vaultkeep-demo.internal` | `Password123!` | Upload encrypted files, invite nominees, adjust check-in interval, confirm check-in, map release rules |
| **Nominee** | Eleanor Vance | `eleanor.nominee@vaultkeep-demo.internal` | `Password123!` | View designated relationships, review grace period alerts, decrypt & download authorized documents |
| **Admin** | Marcus Security | `admin.operator@vaultkeep-demo.internal` | `Password123!` | View operational system health, AWS service justification matrix, inspect security audit trail |

---

## Repository Structure & Deliverables

```
vaultkeep/
├── backend/                               # Persistent Compute Backend (EC2 Node.js/Express API)
│   ├── src/
│   │   ├── config/                        # Environment & AWS configuration
│   │   ├── crypto/envelopeEncryption.ts   # AES-256-GCM + AWS KMS DEK envelope encryption & memory wipe
│   │   ├── db/                            # PostgreSQL connection pool & transactional memory fallback
│   │   │   └── migrations/                # 001_initial_schema.sql & 002_synthetic_seed.sql
│   │   ├── middleware/                    # JWT auth, rate limiter, security headers, role authorization
│   │   ├── services/                      # Document, Nominee, Lifecycle, Notification & Audit services
│   │   ├── controllers/                   # RESTful controllers for all endpoints
│   │   ├── routes/                        # Express API route mapping
│   │   └── server.ts                      # Express app entrypoint with ALB /health probes
│   └── tests/                             # Crypto integrity & E2E API Jest test suites
├── frontend/                              # Responsive Web Client (React 18 + Vite + TypeScript)
│   ├── src/
│   │   ├── components/                    # Navbar, Modal, Badge, StatCard
│   │   ├── contexts/                      # AuthContext, ThemeContext
│   │   ├── pages/                         # Landing, Login, Register, Owner, Vault, Nominee, Admin
│   │   ├── services/api.ts                # Strongly typed REST client
│   │   └── styles/theme.css               # Accessible Light (#F5F8FC) & Dark (#0B1220) design tokens
├── infrastructure/                        # AWS CloudFormation & Serverless Automation
│   ├── cloudformation/
│   │   ├── 01_vpc_network.yaml            # VPC, 3-tier subnets, IGW, Route Tables, Security Groups
│   │   ├── 02_kms_s3.yaml                 # KMS CMK, Key Policy, S3 Bucket with Block Public Access
│   │   ├── 03_rds_postgresql.yaml         # RDS PostgreSQL, DB Subnet Group, non-public storage
│   │   ├── 04_ec2_alb_asg.yaml            # IAM Role, Launch Template, ALB, Target Group, ASG
│   │   ├── 05_serverless_automation.yaml  # EventBridge Rule, Lambda Worker, SNS Topics, CW Alarm
│   │   └── 06_budgets.yaml                # AWS Budgets $10.00 / month cost threshold alert
│   └── lambda/inactivity_handler.js       # Packaged serverless inactivity monitoring worker
└── docs/                                  # Complete Academic Documentation Suite
    ├── 01_SYSTEM_ARCHITECTURE.md          # Network topology & high-level architecture diagram
    ├── 02_ENVELOPE_ENCRYPTION_SPEC.md     # Cryptographic flow, DEK lifecycle & sequence diagrams
    ├── 03_DATABASE_SCHEMA_ERD.md          # PostgreSQL ER diagram, indexes, constraints
    ├── 04_API_SPECIFICATION.md            # REST API contract, request/response schemas
    ├── 05_LIFECYCLE_STATE_MACHINE.md      # State machine diagram, inactivity algorithm, race conditions
    ├── 06_DEPLOYMENT_GUIDE_AWS.md         # Production AWS CloudFormation deployment guide
    ├── 07_LOCAL_INSTALLATION_GUIDE.md     # Step-by-step local setup guide
    ├── 11_VIVA_QUESTIONS_AND_ANSWERS.md   # 30+ comprehensive college viva questions & answers
    ├── 12_REQUIREMENTS_TRACEABILITY_MATRIX.md # RTM mapping all 27 specification requirements
    ├── 13_FINAL_COLLEGE_PROJECT_REPORT.md # 10-chapter academic graduation project report
    └── 14_LIVE_DEMONSTRATION_SCRIPT.md    # 24-step evaluator live demonstration walkthrough
```

---

## AWS Cloud Services Scope

| Service | Architectural Role | Security Control |
| :--- | :--- | :--- |
| **Amazon EC2 & ASG** | Persistent backend compute running API | Private app subnets, ALB ingress only |
| **Application Load Balancer** | Traffic distribution & liveness monitoring | Multi-AZ public subnets, probes `/health` |
| **Amazon VPC** | 3-tier network isolation (`10.0.0.0/16`) | Isolated public, app, and private DB subnets |
| **Amazon RDS (PostgreSQL)** | Persistent metadata & transactional state | Private DB subnets, non-public, encrypted |
| **Amazon S3** | Encrypted document ciphertext storage | Strict Block Public Access, SSE-KMS |
| **AWS KMS** | Customer Managed Key protecting DEKs | Key policies restrict `kms:Decrypt` to EC2 role |
| **Amazon EventBridge** | Daily scheduled inactivity audit | Invokes serverless Lambda evaluation worker |
| **AWS Lambda** | Inactivity monitoring & state transitions | Least-privilege IAM, row-level DB locking |
| **Amazon SNS** | Notification delivery for alerts & grants | Minimal metadata; zero secrets in payloads |
| **Amazon CloudWatch** | Metrics, alarms & centralized logging | Alarm on `FailedDecryptionAttempts >= 3` |
| **AWS Budgets** | Cost governance & threshold alerts | \$10.00 / month academic budget alerts |
| **AWS IAM** | Least-privilege workload authorization | Distinct EC2 and Lambda execution roles |
| **SSM Parameter Store** | Secure configuration & secret management | Encrypted SecureString parameters |

---

## License

This project was built for academic evaluation and digital legacy engineering research under the MIT License.
