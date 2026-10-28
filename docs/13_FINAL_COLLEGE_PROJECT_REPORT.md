# VaultKeep: Cloud-Based Encrypted Digital Legacy & Nominee Access System
## Final Academic Project Report

**Department of Computer Science & Engineering**  
**Course**: Cloud Computing & Advanced Security Architecture Capstone  
**Academic Year**: 2026  

---

## Abstract

In the modern digital era, individuals accumulate critical legal, financial, and personal digital assets, ranging from property documents and insurance policies to account credentials and medical directives. However, conventional cloud storage solutions lack structured mechanisms to ensure conditional, time-delayed posthumous or emergency transfer of these records to trusted beneficiaries without prematurely compromising confidentiality.

**VaultKeep** addresses this challenge by engineering a complete, secure, cloud-native digital legacy platform. The system implements authenticated envelope encryption combining AES-256-GCM and AWS Key Management Service (AWS KMS) Customer Managed Keys. Document ciphertext is isolated in private Amazon S3 buckets with strict public access blocks, while relational state, nominee relationships, and audit trails reside in Amazon RDS for PostgreSQL. Scheduled cloud automation driven by Amazon EventBridge and AWS Lambda continuously evaluates owner check-in deadlines. Upon sustained inactivity, the platform initiates a configurable grace period, dispatches notifications via Amazon Simple Notification Service (SNS), and conditionally releases explicitly authorized documents to verified nominees. The primary backend is deployed on Amazon EC2 behind an Application Load Balancer within a custom 3-tier Amazon VPC, monitored via Amazon CloudWatch metrics and alarms, and governed by AWS Budgets cost controls.

---

## Chapter 1: Introduction & Problem Statement

### 1.1 The Digital Legacy Dilemma
When individuals pass away or become permanently incapacitated, their beneficiaries frequently face insurmountable barriers accessing vital documents, accounts, and directives. Existing digital storage platforms (e.g. Google Drive, Dropbox) present an unviable dilemma:
1. **Premature Exposure**: Sharing passwords or links in advance breaches privacy and risks unauthorized access while the owner is healthy.
2. **Permanent Inaccessibility**: Keeping records locked means documents remain irrecoverable after death, leading to protracted legal battles and lost assets.

### 1.2 The VaultKeep Solution
VaultKeep introduces an automated, cryptographically guaranteed digital custodian that:
- Maintains absolute confidentiality under the owner's active lifetime.
- Continuously verifies owner activity through configurable check-ins.
- Detects dormancy without requiring manual external legal intervention.
- Inserts an owner-configured grace period to safeguard against premature release due to temporary illness, travel, or power outages.
- Releases only explicitly authorized documents to specific nominees under granular release rules.

---

## Chapter 2: System Objectives & Functional Scope

### 2.1 Core Functional Objectives
1. **Encrypted Digital Vault**: Enable authenticated owners to upload, categorize, and securely store personal records.
2. **KMS Envelope Encryption**: Guarantee that plaintext data keys and unencrypted documents never touch persistent storage or database logs.
3. **Nominee Relationship Management**: Facilitate secure, expiring invitation tokens and relationship verification.
4. **Automated Inactivity Detection**: Monitor check-in deadlines via Amazon EventBridge and AWS Lambda.
5. **Fail-Safe Grace Period**: Provide a time-delayed window during which an owner check-in safely aborts pending release.
6. **Granular Release Rules**: Ensure no nominee receives blanket access; every document release requires explicit owner mapping.
7. **Comprehensive Audit Trail**: Maintain an immutable chronological record of all logins, uploads, check-ins, state transitions, and downloads.

---

## Chapter 3: Architectural Design & AWS Infrastructure

### 3.1 Network Topology & VPC Segmentation
VaultKeep is deployed inside a custom Amazon VPC (`10.0.0.0/16`) spanning two Availability Zones. The network is segmented into:
- **Public Subnets (`10.0.1.0/24`, `10.0.2.0/24`)**: Host the Application Load Balancer to accept ingress HTTPS/HTTP traffic.
- **Private Application Subnets (`10.0.11.0/24`, `10.0.12.0/24`)**: Host EC2 instances in an Auto Scaling Group running Node.js / Express.
- **Private Database Subnets (`10.0.21.0/24`, `10.0.22.0/24`)**: Host Amazon RDS for PostgreSQL with zero internet route.

### 3.2 Cloud Service Scope & Justification Matrix
| AWS Service | Technical Purpose | Security & Cost Control |
| :--- | :--- | :--- |
| **Amazon EC2 & ASG** | Persistent backend compute | Auto-scaling based on CPU/traffic, Session Manager access |
| **Application Load Balancer** | Traffic distribution & liveness checks | Continuous health checks on `/health`, SSL offloading |
| **Amazon RDS (PostgreSQL)** | Transactional relational metadata | Private subnets, encrypted at rest, 3NF normalization |
| **Amazon S3** | Private ciphertext storage | Block Public Access, bucket versioning, SSE-KMS |
| **AWS KMS** | Customer Managed Key for DEK wrapping | Key policies restrict `kms:Decrypt` to EC2 role only |
| **Amazon EventBridge** | Scheduled daily inactivity audit | Rule triggers serverless Lambda evaluation worker |
| **AWS Lambda** | Inactivity monitoring worker | Serverless execution, VPC-attached, transaction-safe updates |
| **Amazon SNS** | Notification delivery engine | Alerts for warnings, inactivity, and access grants |
| **Amazon CloudWatch** | Observability & custom metrics | Alarms on `FailedDecryptionAttempts >= 3` |
| **AWS Budgets** | Cost governance | \$10.00 / month budget with actual/forecasted email alerts |

---

## Chapter 4: Cryptographic Implementation & Key Management

### 4.1 Envelope Encryption Protocol
1. When a document is uploaded, the backend invokes AWS KMS `GenerateDataKey(KeyId: CMK, KeySpec: 'AES_256')`.
2. KMS generates a 256-bit Data Encryption Key (DEK) inside its HSM, returning a plaintext DEK and a KMS-wrapped encrypted DEK.
3. The backend generates a 96-bit cryptographically secure IV (`crypto.randomBytes(12)`) and encrypts document bytes in memory using **AES-256-GCM**.
4. AES-256-GCM produces ciphertext and a 128-bit authentication tag.
5. The backend computes the SHA-256 hash of the original plaintext for integrity verification.
6. The plaintext DEK buffer is overwritten with zeros (`plaintextDek.fill(0)`).
7. Ciphertext is transmitted to Amazon S3. The encrypted DEK, IV, authentication tag, and SHA-256 hash are recorded in Amazon RDS.

---

## Chapter 5: Inactivity Automation & Account Lifecycle

### 5.1 Account Lifecycle States
- **`ACTIVE`**: Check-ins confirmed; documents locked.
- **`CHECK_IN_DUE`**: Deadline approaching; automated warnings sent to owner.
- **`GRACE_PERIOD`**: Deadline expired; nominees notified; countdown running; owner check-in aborts release.
- **`RELEASE_READY`**: Grace period concluded; release engine locks database rows.
- **`ACCESS_GRANTED`**: Grants created; authorized nominees receive access.

---

## Chapter 6: Verification, Testing & Results

Automated testing was conducted across unit, cryptographic, integration, and end-to-end levels:
- **Cryptographic Tests (`tests/crypto.test.ts`)**: Confirmed 100% round-trip fidelity, authentication tag tamper detection, and memory clearing.
- **Lifecycle Tests (`tests/api.test.ts`)**: Confirmed deadline extensions, grace period transitions, safeguard aborts, and release grant generation.
- **Security & Authorization Tests**: Verified that nominees are denied access (HTTP 403) while owner is in `ACTIVE` or `GRACE_PERIOD` states.

---

## Chapter 7: Cost Analysis & Budget Governance

Estimated monthly costs for deployment in `us-east-1`:
- EC2 (`t3.micro`, 1 instance): ~\$7.50 / month
- RDS PostgreSQL (`db.t4g.micro`, 20GB gp3): ~\$13.00 / month
- S3 Storage & API Calls: < \$0.20 / month
- AWS KMS (1 CMK + Requests): ~\$1.05 / month
- AWS Budgets Threshold Alert: Configured at \$10.00 / month.

---

## Chapter 8: Conclusion & Future Enhancements

VaultKeep successfully demonstrates a robust, production-grade cloud solution for digital legacy management. The system guarantees cryptographic confidentiality, reliable serverless automation, and auditable beneficiary access. Future enhancements include multi-party threshold cryptography (Shamir's Secret Sharing) requiring multiple nominees to collaborate before un-vaulting sensitive assets.
