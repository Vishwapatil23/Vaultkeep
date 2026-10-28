# VaultKeep Local Installation & Quickstart Guide

This guide describes how to run and evaluate VaultKeep locally on Windows, macOS, or Linux. The platform includes a zero-dependency local simulation mode for AWS KMS, Amazon S3, and Amazon SNS, enabling instant evaluation without requiring active cloud credentials.

---

## 1. Prerequisites

- **Node.js**: v20.x or v22.x LTS installed (`node -v`)
- **NPM**: v10.x+ installed (`npm -v`)
- **Git** (optional)
- **PostgreSQL 15+** (optional; the application includes an in-memory transactional database adapter for frictionless local evaluation when PostgreSQL is not installed).

---

## 2. Directory Layout

The workspace is organized into clean functional modules:
```
vaultkeep/
├── backend/               # Node.js + Express + AWS SDK v3 + KMS Envelope Encryption
├── frontend/              # React 18 + Vite + TypeScript (Accessible Light/Dark Themes)
├── infrastructure/        # AWS CloudFormation & Lambda Automation
└── docs/                  # Architecture, ERD, Crypto Spec, Report & Viva Prep
```

---

## 3. Backend Setup

1. Open PowerShell or a terminal and navigate to the backend directory:
   ```powershell
   cd vaultkeep/backend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Configure environment file (default `.env` is already configured for zero-dependency local simulation):
   ```powershell
   cp .env.example .env
   ```
   *Note: In local mode, `AWS_MOCK_SERVICES=true` and `USE_IN_MEMORY_DB=true` enable local KMS wrapping and local encrypted ciphertext storage in `.s3_encrypted_vault/`.*

4. Run the automated test suites:
   ```powershell
   npm test
   ```
   *All cryptographic envelope encryption, authentication, lifecycle transitions, and release tests will execute and pass.*

5. Start the backend development server:
   ```powershell
   npm run dev
   ```
   *The server starts on `http://localhost:5000` with `/health` and `/ready` probes operational.*

---

## 4. Frontend Setup

1. Open a second terminal window and navigate to the frontend directory:
   ```powershell
   cd vaultkeep/frontend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Start the Vite development server:
   ```powershell
   npm run dev
   ```

4. Open your web browser and navigate to:
   ```
   http://localhost:5173
   ```

---

## 5. Instant Demonstration Logins

The login screen provides one-click pre-fill buttons for synthetic evaluation accounts:

1. **Account Owner**:
   - Email: `alex.vance@vaultkeep-demo.internal`
   - Password: `Password123!`
   - Capabilities: Upload encrypted files, appoint nominees, define release rules, adjust inactivity policy, perform check-in.

2. **Trusted Nominee**:
   - Email: `eleanor.nominee@vaultkeep-demo.internal`
   - Password: `Password123!`
   - Capabilities: View designated relationships, review inactivity grace period alerts, decrypt and download released documents once granted.

3. **Security Operator / Admin**:
   - Email: `admin.operator@vaultkeep-demo.internal`
   - Password: `Password123!`
   - Capabilities: Operational health dashboard, AWS service justification status, audit trail inspection.
