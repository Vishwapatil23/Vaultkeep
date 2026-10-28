# VaultKeep Requirements Traceability Matrix (RTM)

This matrix traces each requirement from the Master Project Specification to its architectural implementation and verification evidence.

| Spec Section | Requirement Description | Implementation Artifact | Verification Status |
| :--- | :--- | :--- | :--- |
| **Section 1 & 2** | Project Title, Purpose & Cloud Scope | `README.md`, `docs/01_SYSTEM_ARCHITECTURE.md` | VERIFIED |
| **Section 3** | Core Objectives (Vault, Nominees, Check-in, KMS, Audit) | `backend/src/`, `frontend/src/` | VERIFIED |
| **Section 4** | Required Tech Stack (React, Vite, Node, Express, RDS, S3, KMS) | `package.json`, `tsconfig.json` | VERIFIED |
| **Section 4.4** | All 13 AWS Services (EC2, ASG, ALB, VPC, RDS, S3, KMS, IAM, SSM, CW, EventBridge, Lambda, SNS, Budgets) | `infrastructure/cloudformation/` | VERIFIED |
| **Section 5.1** | Owner Role & Workflows (Upload, Check-In, Nominee Invite, Rules) | `frontend/src/pages/OwnerDashboard.tsx`, `DocumentVault.tsx` | VERIFIED |
| **Section 5.2** | Nominee Role (Accept, Status View, Released Docs Download) | `frontend/src/pages/NomineePortal.tsx` | VERIFIED |
| **Section 5.3** | Admin Operator Role (Operational Metrics, Audit Search) | `frontend/src/pages/AdminDashboard.tsx`, `AuditLogView.tsx` | VERIFIED |
| **Section 6** | Public, Owner, Nominee, and Admin Frontend Pages | `frontend/src/pages/*.tsx` | VERIFIED |
| **Section 7** | Theme, UX Tokens (Light `#F5F8FC` / Dark `#0B1220`) & Accessibility | `frontend/src/styles/theme.css` | VERIFIED |
| **Section 8** | Performance (Paginated views, no document body in JSON) | `backend/src/controllers/documentController.ts` | VERIFIED |
| **Section 9** | Authentication, bcrypt Password Hashing, JWT, Rate Limiting | `backend/src/middleware/auth.ts`, `server.ts` | VERIFIED |
| **Section 10** | Database Schema (11 normalized tables, constraints, indexes) | `backend/src/db/migrations/001_initial_schema.sql` | VERIFIED |
| **Section 11** | Envelope Encryption (AES-256-GCM + KMS DEK, memory wipe) | `backend/src/crypto/envelopeEncryption.ts` | VERIFIED |
| **Section 11.2** | Zero-Plaintext Keys Guarantee (Wipe memory, never persist DEK) | `backend/src/crypto/envelopeEncryption.ts` | VERIFIED |
| **Section 12** | Nominee Management, High-Entropy Invitation Tokens | `backend/src/controllers/nomineeController.ts` | VERIFIED |
| **Section 13** | Check-In & Inactivity Monitoring State Machine | `backend/src/services/lifecycleService.ts` | VERIFIED |
| **Section 13.2** | Grace Period Fail-Safe & Abort on Owner Check-In | `backend/src/services/lifecycleService.ts` | VERIFIED |
| **Section 13.3** | Digital Legacy Disclaimer (Inactivity != Legal Death) | `frontend/src/pages/LandingPage.tsx` | VERIFIED |
| **Section 14** | Notifications with Amazon SNS (5 event types, delivery states) | `backend/src/services/notificationService.ts` | VERIFIED |
| **Section 15** | VPC Architecture (3-tier subnets, private DB, SG rules) | `infrastructure/cloudformation/01_vpc_network.yaml` | VERIFIED |
| **Section 16** | Security, Least Privilege IAM, S3 Block Public Access | `infrastructure/cloudformation/02_kms_s3.yaml` | VERIFIED |
| **Section 17** | Audit Logging (Immutable chronological records, correlation IDs) | `backend/src/services/auditService.ts` | VERIFIED |
| **Section 18** | RESTful API Routes (Grouped by functional area) | `backend/src/routes/api.ts`, `docs/04_API_SPECIFICATION.md` | VERIFIED |
| **Section 19** | Work Division for Three-Person College Team | `docs/17_TASK_TRACKER_AND_TEAM_ROLES.md` | VERIFIED |
| **Section 20** | Working Demonstration Scenario (24 steps) | `docs/14_LIVE_DEMONSTRATION_SCRIPT.md` | VERIFIED |
| **Section 21** | Comprehensive Automated Test Suites | `backend/tests/crypto.test.ts`, `api.test.ts` | VERIFIED |
| **Section 22** | Reliability, Health Probes (`/health`, `/ready`) | `backend/src/server.ts` | VERIFIED |
| **Section 23** | Cost Control & AWS Budgets ($10.00 / month threshold alert) | `infrastructure/cloudformation/06_budgets.yaml` | VERIFIED |
| **Section 24** | 30 Required Project Deliverables | `docs/`, `backend/`, `frontend/`, `infrastructure/` | VERIFIED |
| **Section 25** | College Cloud Service Justification Table | `docs/01_SYSTEM_ARCHITECTURE.md`, `AdminDashboard.tsx` | VERIFIED |
| **Section 26** | Acceptance Criteria Completion | Complete System Verified | VERIFIED |
| **Section 27** | Working Principles (Honesty, Synthetic data, No hardcoded secrets) | Repository Verified | VERIFIED |
