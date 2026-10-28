# VaultKeep Security, Cryptography & Privacy Verification Checklist

This checklist verifies compliance with the security, privacy, and architectural controls stipulated in Master Project Specification Section 9, 11, and 16.

---

## 1. Cryptographic Security Controls

| Control | Description | Implementation File | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **AES-256-GCM** | Authenticated encryption providing confidentiality and integrity | `backend/src/crypto/envelopeEncryption.ts` | Verified in test suite (PASS) |
| **KMS Customer Managed Key** | Root key material never leaves AWS KMS Hardware Security Modules | `infrastructure/cloudformation/02_kms_s3.yaml` | CloudFormation key policy |
| **Zero-Plaintext Persistence** | Plaintext document bytes and raw DEKs are never stored in RDS or logs | `backend/src/controllers/documentController.ts` | Inspected database schema & S3 storage |
| **DEK Memory Sanitization** | Plaintext DEK buffers explicitly overwritten with zeros (`plaintextDek.fill(0)`) | `backend/src/crypto/envelopeEncryption.ts` | Verified in `tests/verify_vaultkeep.js` (PASS) |
| **Unique Nonce (IV)** | Cryptographically secure 96-bit random IV per document | `backend/src/crypto/envelopeEncryption.ts` | `crypto.randomBytes(12)` unique per file |
| **Tamper Detection** | Altered ciphertext or corrupted auth tag throws immediate decryption error | `backend/src/crypto/envelopeEncryption.ts` | Verified in `tests/verify_vaultkeep.js` (PASS) |
| **Integrity Checksum** | SHA-256 hash verified post-decryption before streaming | `backend/src/crypto/envelopeEncryption.ts` | Validated in decryption workflow |

---

## 2. Infrastructure & Network Isolation

| Control | Description | Implementation File | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **S3 Block Public Access** | All four public access block settings enabled on document bucket | `infrastructure/cloudformation/02_kms_s3.yaml` | `BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true` |
| **Non-Public RDS** | Amazon RDS PostgreSQL located in private DB subnets with zero internet route | `infrastructure/cloudformation/03_rds_postgresql.yaml` | `PubliclyAccessible: false` |
| **Tiered Subnets** | Strict 3-tier VPC segmentation (Public ALB, Private App, Private DB) | `infrastructure/cloudformation/01_vpc_network.yaml` | Distinct CIDRs across 2 AZs |
| **Security Groups** | App SG allows traffic on port 5000 only from ALB SG; DB SG allows port 5432 only from App SG | `infrastructure/cloudformation/01_vpc_network.yaml` | Least-privilege ingress rules |
| **IAM Least Privilege** | EC2 and Lambda roles granted strictly required permissions; no `*` admin access | `infrastructure/cloudformation/04_ec2_alb_asg.yaml`, `05_serverless_automation.yaml` | Scoped resource ARNs |

---

## 3. Application Authentication & Data Privacy

| Control | Description | Implementation File | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Password Hashing** | Salted bcrypt hashing with 10 salt rounds | `backend/src/controllers/authController.ts` | No plaintext passwords in DB |
| **Brute-Force Protection** | Rate limiting on `/api/auth/login` (100 reqs / 15 min) | `backend/src/server.ts` | Express rate limiter active |
| **Security Headers** | Helmet middleware configuring CSP, HSTS, and X-Content-Type-Options | `backend/src/server.ts` | `app.use(helmet())` active |
| **Resource-Level Auth** | Nominee download strictly checks `release_grants` and owner `ACCESS_GRANTED` state | `backend/src/controllers/nomineeController.ts` | Verified in test suite (PASS) |
| **Audit Trail** | Immutable audit records with correlation IDs for all logins, uploads, and downloads | `backend/src/services/auditService.ts` | Verified in `tests/verify_vaultkeep.js` (PASS) |
| **Legal Disclaimer** | Digital legacy policy distinguishes inactivity detection from legal death | `frontend/src/pages/LandingPage.tsx` | Prominently displayed in UI |
| **Synthetic Test Data** | Exclusively synthetic demonstration documents and test identities | `backend/src/db/migrations/002_synthetic_seed.sql` | Zero real PII in codebase |
