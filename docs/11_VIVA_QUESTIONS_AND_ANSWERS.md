# VaultKeep College Viva Examination — Comprehensive Technical Q&A

This document prepares the student project team for rigorous viva voce questions covering cloud computing, cryptographic engineering, database design, serverless automation, and systems architecture.

---

## Category 1: Cryptography, Key Management & Envelope Encryption

### Q1: What is Envelope Encryption and why did you use it instead of directly encrypting data with KMS?
**Answer**: Envelope encryption is a multi-layered cryptographic practice where sensitive plaintext data is encrypted using a unique, short-lived Data Encryption Key (DEK), and the DEK itself is encrypted (wrapped) under a master Key Encryption Key (KEK) protected by AWS KMS.
We chose envelope encryption for three critical reasons:
1. **Size Limitations**: Direct KMS `Encrypt` API calls are limited to a maximum payload size of 4 KB. Real-world personal documents (PDFs, images, deeds) often exceed several megabytes.
2. **Performance & Latency**: Encrypting large payloads locally in application memory with symmetric AES-256-GCM is orders of magnitude faster than transmitting raw document bytes across the network to AWS KMS.
3. **KMS API Quotas & Cost**: Using KMS only to generate and wrap 32-byte DEKs drastically minimizes KMS API request charges ($0.03 per 10,000 requests) and prevents hitting AWS account KMS request quotas.

### Q2: Does the raw key material of your AWS KMS Customer Managed Key ever leave KMS?
**Answer**: No. AWS KMS Customer Managed Keys are generated, stored, and managed strictly inside FIPS 140-2 (and FIPS 140-3) validated Hardware Security Modules (HSMs). The unencrypted master key material never leaves the HSM boundary under any circumstance. When our application calls `GenerateDataKey`, KMS generates the key within the HSM, encrypts a copy under the master key, and returns the encrypted DEK along with a temporary plaintext DEK in memory.

### Q3: How do you address the risk of the plaintext Data Encryption Key lingering in application memory?
**Answer**: In conventional envelope encryption, the application receives a temporary plaintext DEK to encrypt or decrypt document bytes. To prevent this key from lingering in heap memory or appearing in core dumps, our Node.js implementation:
1. Keeps the plaintext key lifetime strictly localized to the execution scope of `encryptDocument` and `decryptDocument`.
2. Explicitly overwrites the memory buffer with zeros using `plaintextDek.fill(0)` in a `finally` block before the buffer is discarded.
3. Never logs, prints, or serializes the plaintext DEK.

### Q4: Why did you choose AES-256-GCM over AES-256-CBC?
**Answer**: AES-256-GCM (Galois/Counter Mode) provides **Authenticated Encryption with Associated Data (AEAD)**. Unlike CBC mode, GCM produces a 128-bit authentication tag along with ciphertext. This guarantees both confidentiality and authenticity. If an unauthorized actor or corrupted storage alters even a single bit of the stored ciphertext, AES-GCM's authentication tag verification fails immediately during decryption, rejecting the tampered document. Furthermore, CBC mode requires padding (making it susceptible to padding oracle attacks), whereas GCM is a stream-cipher mode requiring no padding.

### Q5: What is the purpose of the 96-bit IV (Initialization Vector) in AES-256-GCM?
**Answer**: The IV (or nonce) ensures that encrypting identical documents produces completely distinct ciphertexts every time. In AES-GCM, reusing an IV with the same key catastrophically compromises the authentication tag and key security. VaultKeep generates a cryptographically secure random 12-byte IV (`crypto.randomBytes(12)`) for every individual encryption operation.

---

## Category 2: Cloud Networking, VPC & Architecture

### Q6: Walk us through the network architecture of your VPC. Why did you use three tiers of subnets?
**Answer**: Our VPC (`10.0.0.0/16`) spans two Availability Zones and is partitioned into three distinct functional tiers:
1. **Public Subnets (`10.0.1.0/24`, `10.0.2.0/24`)**: Attached to an Internet Gateway. Only the Application Load Balancer (ALB) resides here to accept inbound HTTP/HTTPS traffic.
2. **Private Application Subnets (`10.0.11.0/24`, `10.0.12.0/24`)**: Host our EC2 Auto Scaling backend instances. They have no direct public IP addresses and cannot receive inbound traffic directly from the internet.
3. **Private Database Subnets (`10.0.21.0/24`, `10.0.22.0/24`)**: Host our Amazon RDS PostgreSQL instance. They have zero route to the internet and are strictly reachable on port 5432 only from the application security group.
This defense-in-depth architecture prevents external network access to the database and application compute tiers.

### Q7: Why didn't you deploy a NAT Gateway in the private subnets?
**Answer**: NAT Gateways cost approximately \$32.40 per month per AZ in AWS, plus data transfer charges, which exceeds a student academic project budget. Instead, we designed our architecture using either VPC Endpoints for S3 and KMS, or placed our persistent compute in private subnets with controlled egress, or utilized Session Manager. In local/demonstration mode, our backend supports simulated cloud services so that zero AWS costs are incurred while testing full envelope encryption.

### Q8: How does the Application Load Balancer determine if an EC2 instance is healthy?
**Answer**: The ALB target group continually performs HTTP health checks against our dedicated `/health` endpoint every 30 seconds. A simple process existence check is insufficient; our `/health` probe actively verifies application readiness and returns HTTP 200 with `{ "status": "UP" }`. If an instance crashes or fails three consecutive checks, the ALB stops routing traffic to it and the Auto Scaling Group launches a replacement instance.

---

## Category 3: Database Design, Transactions & Consistency

### Q9: Why is document content stored in Amazon S3 rather than as a `BYTEA` column in PostgreSQL?
**Answer**: Storing binary document files inside a relational database causes database bloat, degrades buffer cache performance, slows down backups and replication, and significantly increases RDS storage costs. S3 is designed specifically for durable (99.999999999%), highly scalable object storage at a fraction of the cost ($0.023/GB vs $0.115/GB for gp3 RDS). PostgreSQL stores only lightweight relational metadata (size, MIME type, KMS key ID, encrypted DEK, IV, and checksum), maintaining optimal database query performance.

### Q10: How do you handle race conditions when an owner checks in while the inactivity engine is running?
**Answer**: We employ database transactions with row-level locking (`SELECT ... FOR UPDATE`). When an owner performs a check-in, the transaction immediately resets `current_state = 'ACTIVE'`, resets `next_check_in_deadline`, and nullifies `grace_period_ends_at`. If the background automation engine is evaluating the account concurrently, the row lock prevents the engine from reading stale data, and owner check-in is granted absolute priority to abort any pending release.

### Q11: How do you prevent duplicate notifications or duplicate release grants if the scheduled Lambda runs twice?
**Answer**: Idempotency is enforced at the database level:
1. `release_grants` enforces a compound unique constraint: `UNIQUE (nominee_id, document_id)`. Insertion queries use `ON CONFLICT DO NOTHING`.
2. The inactivity engine checks `release_execution_state != 'EXECUTED'` before attempting release logic.
3. Once an account reaches `ACCESS_GRANTED`, subsequent scheduled runs skip that account entirely.

---

## Category 4: Digital Legacy Policy & Inactivity State Machine

### Q12: How does VaultKeep detect that an account owner is inactive?
**Answer**: The owner configures a check-in interval (e.g. 30 days). Each successful check-in extends the `next_check_in_deadline = now + interval`. Amazon EventBridge invokes our Lambda inactivity worker on a daily schedule. If `now >= next_check_in_deadline`, the account transitions to `GRACE_PERIOD`.

### Q13: Does inactivity establish a legal determination of death or incapacitation?
**Answer**: No. This is a critical ethical and architectural distinction. VaultKeep explicitly includes a legal disclaimer that digital inactivity does not prove legal death or incapacity, nor does it replace legal wills or probate court proceedings. The platform purely executes the owner's explicit, pre-configured digital access instructions.

### Q14: What happens during the Grace Period? Can a nominee download documents during this time?
**Answer**: No. During `GRACE_PERIOD`, document access is **strictly blocked**. Nominees receive an alert that the owner is overdue, but cannot download files. The grace period provides a time-delayed safety window (e.g. 7 to 14 days) allowing an owner who was temporarily hospitalized, traveling without internet, or delayed to log in, confirm check-in, and instantly abort the release process.

---

## Category 5: IAM, Security, Monitoring & CloudWatch

### Q15: How do you enforce least-privilege access in AWS IAM?
**Answer**: We implement distinct, tightly scoped IAM roles:
1. **EC2 Role**: Restricted to `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` only on `arn:aws:s3:::vaultkeep-encrypted-documents-*`, `kms:GenerateDataKey` and `kms:Decrypt` on our CMK, and `ssm:GetParametersByPath` on `/vaultkeep/*`. It has no administrative permissions.
2. **Lambda Role**: Restricted strictly to VPC network interface creation and `sns:Publish` on the two VaultKeep topics.
3. No IAM user access keys are stored in code or committed to Git.

### Q16: What CloudWatch Alarm did you implement and what does it detect?
**Answer**: We implemented the `VaultKeep-FailedDecryption-SecurityAlarm`. Whenever a decryption operation fails (e.g. corrupted ciphertext or tampered authentication tag), our API increments the custom CloudWatch metric `FailedDecryptionAttempts`. If 3 or more decryption failures occur within a 5-minute evaluation period, CloudWatch triggers an alarm that sends an alert to our SNS topic. This signals potential cryptographic tampering or an unauthorized brute-force attack.

### Q17: How did you configure AWS Budgets?
**Answer**: We created a monthly cost budget of \$10.00 USD in AWS Budgets. It configures two threshold alerts: an alert when actual spend exceeds 80% ($8.00), and a forecasted alert when projected spend exceeds 100% ($10.00). Alerts are dispatched to the operator's email address via SNS.
