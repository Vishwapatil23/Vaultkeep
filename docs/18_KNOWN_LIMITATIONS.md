# VaultKeep Known Technical Limitations & Architecture Trade-Offs

In accordance with Master Project Specification Section 24 and 27, this document transparently records technical limitations, environmental constraints, and architectural trade-offs.

---

## 1. Digital Legacy & Legal Scope Limitations

- **Technical Inactivity vs. Legal Determination**:
  VaultKeep detects prolonged inactivity based strictly upon owner check-in deadlines. The system cannot independently establish medical incapacitation, legal death, or statutory heirship. It must not be marketed or deployed as a substitute for official probate court filings, wills, or legal estate administration.
- **Beneficiary Identity Proofing**:
  Nominee verification in the current scope relies on email-based invitation tokens and password credentials. Enterprise production deployments would require multi-factor authentication (MFA) and external biometric or identity document verification (e.g., eID / notary attestation).

---

## 2. Cryptographic & Memory Limitations

- **JavaScript Runtime Memory Clearing**:
  Our backend implementation explicitly overwrites the temporary plaintext DEK memory buffer using `plaintextDek.fill(0)` in a `finally` block immediately after encryption and decryption. However, because V8 / Node.js manages heap memory through an automated garbage collector, operating-system-level guarantees against memory scraping or core dump analysis are imperfect in high-level managed languages. A stricter boundary would isolate key operations into a dedicated C++ / Rust sidecar or AWS Nitro Enclave.
- **KMS Payload Size Boundary**:
  AWS KMS directly encrypts payloads only up to 4 KB. This necessitates our envelope encryption pattern; direct KMS storage is not supported.

---

## 3. Cloud Provider & Student Budget Constraints

- **AWS Learner Lab Session Expiration**:
  In AWS Academy / Learner Lab environments, IAM temporary credentials expire every 4 hours (`InvalidClientTokenId`). In production, persistent IAM EC2 Instance Profiles eliminate static credential rotation requirements.
- **Amazon SNS Sandbox Limitations**:
  In newly created AWS accounts, Amazon SNS operates in a "SMS Sandbox" mode where messages can only be dispatched to verified phone numbers. Email subscriptions require manual confirmation via the activation link sent to the inbox.
- **NAT Gateway Cost Trade-Off**:
  To adhere to student budget constraints (< \$15.00/month), NAT Gateways (\$64.80/month for Multi-AZ) were omitted. Private EC2 instances communicate with AWS services via VPC Endpoints or simulated local adapters during demonstration mode.
