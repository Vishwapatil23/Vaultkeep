# VaultKeep College Evaluator Screenshot & Evidence Checklist

Use this checklist during academic project reviews to verify every required visual screen and operational state.

---

## 1. Public & Authentication Screens

- [x] **SS-01: Welcome / Landing Page**
  - Path: `/`
  - Elements: Hero banner, 6 architectural pillar cards, legal legacy disclaimer.
- [x] **SS-02: User Registration**
  - Path: `/register`
  - Elements: Role selector (Vault Owner vs Nominee), password strength requirement.
- [x] **SS-03: User Login with Quick Demo Identities**
  - Path: `/login`
  - Elements: Email/password form, one-click demo buttons for Alexander (Owner), Eleanor (Nominee), and Marcus (Admin).

---

## 2. Account Owner Experience Screens

- [x] **SS-04: Owner Dashboard (Active State)**
  - Path: `/dashboard`
  - Elements: Status badge (`ACTIVE`), Next Check-In Deadline countdown (Days remaining), "Confirm Check-In Now" button, summary metrics, check-in history table.
- [x] **SS-05: Encrypted Document Vault**
  - Path: `/vault`
  - Elements: Category filter pills, search input, document metadata table (algorithm `AES-256-GCM`, SHA-256 hash preview, size, assigned nominees).
- [x] **SS-06: Upload Document Modal**
  - Modal over `/vault`
  - Elements: File picker, category selector, Envelope Encryption Guarantee callout.
- [x] **SS-07: Trusted Nominee Directory**
  - Path: `/nominees`
  - Elements: Nominee cards, relationship tags, invitation status badges (`PENDING` / `ACCEPTED`), assigned document count.
- [x] **SS-08: Invite Nominee Modal**
  - Modal over `/nominees`
  - Elements: Full legal name, email, phone, relationship dropdown, invitation token generator.
- [x] **SS-09: Inactivity Policy & State Flow Visualizer**
  - Path: `/lifecycle`
  - Elements: 4-step state flow diagram, interval inputs, Demonstration Simulation panel ("Simulate Missed Check-In").
- [x] **SS-10: Grace Period Active Warning Banner**
  - Path: `/dashboard` (during simulation)
  - Elements: Amber banner, grace period countdown, "Abort & Check-In" action button.
- [x] **SS-11: Document Release Rule Editor**
  - Path: `/rules`
  - Elements: Document-to-nominee mapping table, access duration (e.g. 30 days or Indefinite).
- [x] **SS-12: Security Audit Trail**
  - Path: `/audit`
  - Elements: Filterable log table, timestamps, actors, actions, outcomes, correlation UUIDs.

---

## 3. Nominee Experience Screens

- [x] **SS-13: Nominee Portal (Owner Active)**
  - Path: `/nominee-dashboard`
  - Elements: Appointed owner relationship card, educational notice that documents remain in owner custody.
- [x] **SS-14: Inactivity Alert Banner (Nominee View)**
  - Path: `/nominee-dashboard` (during grace period)
  - Elements: Notice indicating appointing owner missed check-in and grace period is active.
- [x] **SS-15: Authorized Released Documents**
  - Path: `/released-docs` (in `ACCESS_GRANTED` state)
  - Elements: Released documents table, "Decrypt & Download" action buttons.

---

## 4. Administrative & Cloud Telemetry Screens

- [x] **SS-16: Admin Operational Health & Cloud Services Matrix**
  - Path: `/admin-dashboard`
  - Elements: System status, compute/RDS/KMS/S3 status, AWS service justification table.
