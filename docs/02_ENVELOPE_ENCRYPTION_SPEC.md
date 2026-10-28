# VaultKeep Envelope Encryption Specification & Cryptographic Data Flow

## 1. Cryptographic Design Principles

VaultKeep enforces client/document-level envelope encryption prior to storing any object in cloud storage. The implementation guarantees that:
1. **The AWS KMS Customer Managed Key (CMK) raw key material never leaves AWS KMS hardware security modules (HSMs).**
2. **Every document is encrypted with a unique, cryptographically random 256-bit Data Encryption Key (DEK).**
3. **Authenticated Encryption (AES-256-GCM)** is used to provide confidentiality, authenticity, and tamper detection.
4. **Zero-Plaintext Persistence**: Neither plaintext document contents nor plaintext DEKs are ever stored in PostgreSQL, Amazon S3, configuration parameters, or application logs.
5. **Memory Sanitization**: Plaintext DEK buffers in Node.js runtime memory are explicitly wiped (`plaintextDek.fill(0)`) immediately upon completion of encryption or decryption operations.

---

## 2. Document Upload & Encryption Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Authenticated Owner
    participant Web as Web Frontend (React)
    participant API as Backend API (EC2 / Node.js)
    participant KMS as AWS Key Management Service (KMS)
    participant S3 as Amazon S3 (Private Bucket)
    participant RDS as Amazon RDS (PostgreSQL)

    Owner->>Web: Selects sensitive document & clicks "Upload"
    Web->>API: POST /api/documents (Multipart: Plaintext File Buffer)
    Note over API: Authenticate Owner & validate MIME/size policy

    API->>KMS: GenerateDataKey(KeyId: CMK, KeySpec: AES_256, EncryptionContext)
    KMS-->>API: Returns Plaintext DEK (32 bytes) + KMS-Wrapped Encrypted DEK (CiphertextBlob)

    Note over API: 1. Generate unique 96-bit IV (12 bytes)<br/>2. Initialize AES-256-GCM cipher with Plaintext DEK & IV<br/>3. Compute Ciphertext & 128-bit Authentication Tag<br/>4. Compute SHA-256 Checksum of original plaintext<br/>5. Memory Wipe: plaintextDek.fill(0)

    API->>S3: PutObject(Bucket, Key: 'vault/{ownerId}/{docId}.enc', Body: Ciphertext)
    S3-->>API: PutObject Success (Ciphertext Stored)

    API->>RDS: INSERT INTO documents (id, owner_id, original_name, storage_key, encrypted_dek, dek_iv, auth_tag, checksum_sha256, kms_key_id)
    RDS-->>API: Record Inserted

    API->>RDS: INSERT INTO audit_logs (DOCUMENT_ENCRYPTED_AND_UPLOADED)
    API-->>Web: 201 Created (Document Metadata & SHA-256 Checksum)
    Web-->>Owner: Displays document in encrypted vault table
```

---

## 3. Document Download & Decryption Sequence (Owner / Authorized Nominee)

```mermaid
sequenceDiagram
    autonumber
    actor User as Owner / Authorized Nominee
    participant Web as Web Frontend (React)
    participant API as Backend API (EC2 / Node.js)
    participant RDS as Amazon RDS (PostgreSQL)
    participant S3 as Amazon S3 (Private Bucket)
    participant KMS as AWS Key Management Service (KMS)

    User->>Web: Clicks "Download Document"
    Web->>API: GET /api/documents/:id/download (or /api/nominee/released-documents/:id/download)

    Note over API: Resource Authorization Verification:<br/>1. Verify JWT & User Identity<br/>2. If Nominee: Verify Owner State is ACCESS_GRANTED and active release_grant exists<br/>3. If check fails: Deny 403 & log security event

    API->>RDS: SELECT storage_key, encrypted_dek_base64, dek_iv, auth_tag, checksum_sha256, kms_key_id FROM documents
    RDS-->>API: Returns Metadata & KMS-Wrapped DEK

    API->>S3: GetObject(Bucket, Key: storage_key)
    S3-->>API: Returns Ciphertext Buffer

    API->>KMS: Decrypt(CiphertextBlob: encrypted_dek, KeyId: kms_key_id, EncryptionContext)
    KMS-->>API: Returns Plaintext DEK in temporary memory buffer

    Note over API: 1. Initialize AES-256-GCM decipher with Plaintext DEK & IV<br/>2. Set expected Authentication Tag<br/>3. Decrypt Ciphertext Buffer<br/>4. Verify SHA-256 Checksum<br/>5. Memory Wipe: plaintextDek.fill(0)

    alt Tag or Ciphertext Tampered With
        Note over API: Decryption fails with AuthenticationError!
        API->>RDS: INSERT INTO security_events (DECRYPTION_FAILURE)
        API-->>Web: 500 Cryptographic Tamper Detected
    else Decryption Successful
        API->>RDS: INSERT INTO audit_logs (DOCUMENT_DECRYPTED_AND_DOWNLOADED, outcome: SUCCESS)
        API-->>Web: 200 OK (Content-Disposition: attachment, Plaintext Stream)
        Web-->>User: File downloaded to local browser
    end
```

---

## 4. Cryptographic Parameter Reference

| Component | Standard / Value | Purpose |
| :--- | :--- | :--- |
| **KMS Master Key (CMK)** | Customer Managed Key (Symmetric) | Wraps and un-wraps Document Data Encryption Keys |
| **Data Encryption Key (DEK)** | 256-bit Cryptographic Random | Encrypts document file contents in memory |
| **Cipher Algorithm** | AES-256-GCM (Authenticated) | Guarantees confidentiality and message integrity |
| **Initialization Vector (IV)** | 96-bit (12 bytes) Cryptographic Nonce | Unique per encryption operation; never reused with same DEK |
| **Authentication Tag** | 128-bit (16 bytes) | Verifies ciphertext was not modified or corrupted |
| **Data Integrity Check** | SHA-256 Hash | Plaintext checksum validated post-decryption |
| **Memory Sanitization** | `Buffer.fill(0)` | Overwrites plaintext key buffer before garbage collection |
