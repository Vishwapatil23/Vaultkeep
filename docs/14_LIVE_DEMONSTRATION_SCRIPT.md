# VaultKeep Master Live Demonstration Script for Evaluators

This script provides an exact step-by-step walkthrough for demonstrating VaultKeep during college project examinations and evaluator presentations.

---

## Demonstration Setup

1. Start Backend: `cd vaultkeep/backend && npm run dev`
2. Start Frontend: `cd vaultkeep/frontend && npm run dev`
3. Open Browser at: `http://localhost:5173`

---

## 24-Step Demonstration Scenario

### Phase 1: Authentication & Vault Overview
1. **Show Landing Page**: Highlight the architectural overview, security principles, envelope encryption explanation, and digital legacy legal disclaimer.
2. **Access Login Screen**: Click "Sign In". Point out the quick synthetic demonstration identities.
3. **Login as Account Owner**: Click "Alexander Vance (Account Owner)". Note instant JWT authentication and role-based redirect.
4. **Inspect Owner Dashboard**: Point out the Next Check-In Deadline countdown (e.g. 30 days), current status badge (`ACTIVE`), and summary metrics.

### Phase 2: Document Envelope Encryption & Storage
5. **Navigate to Encrypted Vault**: Click "Encrypted Vault" tab.
6. **Open Upload Modal**: Click "Upload Encrypted Document". Point out the Envelope Encryption guarantee callout.
7. **Select Test Document**: Pick a test file (e.g. `financial_portfolio_2026.txt`) and select category `FINANCIAL`.
8. **Click "Encrypt & Save"**:
   - Explain to evaluator: "The backend calls KMS `GenerateDataKey`, creates a 256-bit DEK, encrypts the document with AES-256-GCM, computes an authentication tag and SHA-256 checksum, wipes the plaintext DEK from memory, and sends ONLY ciphertext to S3."
9. **Verify Ciphertext Storage**: Show the new document in the vault table. Point out the encryption algorithm (`AES-256-GCM`), version (`v1`), and SHA-256 checksum preview.
10. **Test Owner Decryption & Download**: Click the download icon. Show that the backend unwraps the DEK via KMS, authenticates the tag, verifies the SHA-256 hash, and downloads the original plaintext file.

### Phase 3: Nominee Designation & Explicit Release Policy
11. **Navigate to Nominee Directory**: Show appointed nominee Eleanor Vance (`eleanor.nominee@vaultkeep-demo.internal`).
12. **Navigate to Release Rules**: Click "Release Rules" tab.
13. **Create Release Rule**: Click "Add Document Release Rule". Pair `financial_portfolio_2026.txt` with Eleanor Vance and set access duration to `30 Days`. Click "Confirm Release Rule".
14. **Explain Granular Policy**: Emphasize to evaluator: "Nominees have zero access by default. Access is strictly granted per-document through explicit, confirmed rules."

### Phase 4: Inactivity Detection & Grace Period Safeguard
15. **Navigate to Inactivity Policy**: Click "Inactivity Policy" tab. Show the State Machine Visualizer currently at Step 1 (`ACTIVE`).
16. **Explain Scheduled Cloud Trigger**: Explain how EventBridge invokes AWS Lambda daily to audit check-in deadlines.
17. **Execute Inactivity Simulation**: Under the Demonstration Panel, click **"1. Simulate Missed Check-In (Triggers GRACE_PERIOD)"**.
18. **Observe State Transition**:
   - The status badge transitions immediately to **`GRACE_PERIOD`** (Amber warning).
   - An alert banner appears displaying the active grace period countdown.
   - SNS sends an inactivity alert to Eleanor and an urgent warning to Alexander.
19. **Demonstrate Owner Abort Safeguard**:
   - Click "Confirm Check-In Now" on the dashboard.
   - Point out that the grace period is instantly cancelled and account status restored to **`ACTIVE`**.
   - Explain: "This demonstrates the critical fail-safe preventing premature release if the owner was simply delayed."

### Phase 5: Grace Period Expiration & Nominee Document Release
20. **Trigger Grace Period Expiration**: Re-run the simulation and click **"2. Elapse Grace Period (Triggers ACCESS_GRANTED)"**.
21. **Observe Final Transition**: Account status updates to **`ACCESS_GRANTED`**; `release_grants` are generated idempotently.
22. **Log Out and Log In as Nominee**:
   - Log out of Alexander's account.
   - Log in using "Eleanor Vance (Trusted Nominee)".
23. **Verify Authorized Nominee Access**:
   - Show the Nominee Portal displaying the relationship with Alexander Vance in `ACCESS_GRANTED` state.
   - Show the "Authorized Released Documents" table containing `financial_portfolio_2026.txt`.
   - Click **"Decrypt & Download"**: The document decrypts successfully and downloads to Eleanor's computer!
   - Point out: "If Eleanor tries to access any document not explicitly authorized in a release rule, access is strictly denied (HTTP 403)."

### Phase 6: Observability, CloudWatch & Audit Verification
24. **Log In as Admin / Operator**:
   - Log in as "Marcus Security (Admin Operator)".
   - Review the **System Health & AWS Cloud Services Justification Table** showing compute, database, KMS, and S3 status.
   - Open the **Audit Trail**: Show the complete chronological log entries for `USER_LOGIN`, `DOCUMENT_ENCRYPTED_AND_UPLOADED`, `LIFECYCLE_TRANSITION_GRACE_PERIOD`, `LIFECYCLE_TRANSITION_ACCESS_GRANTED`, and `NOMINEE_RELEASED_DOCUMENT_DOWNLOADED`.
