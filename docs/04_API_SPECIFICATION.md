# VaultKeep REST API Specification

## 1. API Architecture & Standards

- **Base URL**: `/api`
- **Transport**: HTTPS with TLS 1.3
- **Format**: JSON (`Content-Type: application/json` or `multipart/form-data` for uploads)
- **Authentication**: JWT Bearer Token passed via HTTP Header: `Authorization: Bearer <TOKEN>`
- **Correlation**: `x-correlation-id` header tracked across all logs and responses.

---

## 2. API Endpoint Directory

### Authentication & Identity (`/api/auth`)

#### `POST /api/auth/register`
- **Purpose**: Creates a new user account (OWNER, NOMINEE, or ADMIN).
- **Body**: `{ "name": "string", "email": "string", "password": "string", "role": "OWNER" | "NOMINEE", "phone": "string" }`
- **Response `201 Created`**: `{ "message": "string", "token": "jwt_token", "user": { "id", "name", "email", "role" } }`

#### `POST /api/auth/login`
- **Purpose**: Authenticates user and returns session JWT. Protected by brute-force rate limiter.
- **Body**: `{ "email": "string", "password": "string" }`
- **Response `200 OK`**: `{ "message": "string", "token": "jwt_token", "user": { "id", "name", "email", "role" } }`

#### `GET /api/auth/me`
- **Purpose**: Retrieves currently authenticated user profile, settings, and lifecycle state.
- **Auth**: Required (`Bearer`)
- **Response `200 OK`**: `{ "user": { ... }, "settings": { ... }, "lifecycle": { ... } }`

---

### Check-Ins & Lifecycle (`/api/check-ins` & `/api/lifecycle`)

#### `POST /api/check-ins`
- **Purpose**: Performs authenticated owner check-in, resets deadline by configured interval, safely aborts any active grace period, and records audit trail.
- **Auth**: Required (`OWNER` role)
- **Response `200 OK`**: `{ "message": "string", "checkIn": { ... }, "lifecycle": { ... } }`

#### `GET /api/lifecycle/status`
- **Purpose**: Returns current account lifecycle status, next deadline, days remaining, and grace period end.
- **Auth**: Required
- **Response `200 OK`**: `{ "lifecycle": { "current_state", "next_check_in_deadline", ... }, "settings": { ... } }`

#### `PATCH /api/lifecycle/policy`
- **Purpose**: Updates check-in interval (1-365 days), grace period duration (1-90 days), and warning days.
- **Auth**: Required (`OWNER` role)
- **Body**: `{ "checkInIntervalDays": 30, "gracePeriodDays": 7, "warningDays": 5 }`
- **Response `200 OK`**: `{ "message": "string", "settings": { ... } }`

#### `POST /api/lifecycle/evaluate`
- **Purpose**: Executes inactivity evaluation engine (invoked on schedule by EventBridge / Lambda).
- **Response `200 OK`**: `{ "message": "string", "summary": { "evaluatedCount", "gracePeriodStartedCount", "releasedCount" } }`

#### `POST /api/lifecycle/simulate-inactivity`
- **Purpose**: Demonstration fixture to simulate expired check-in deadline for viva presentation.
- **Auth**: Required (`OWNER` role)
- **Response `200 OK`**: `{ "message": "Demonstration simulation: Check-in deadline expired. State transition triggered.", "result": { ... } }`

---

### Documents & Encryption (`/api/documents`)

#### `POST /api/documents`
- **Purpose**: Uploads and encrypts a sensitive document with AWS KMS envelope encryption (AES-256-GCM) before storing ciphertext in S3.
- **Auth**: Required (`OWNER` role)
- **Content-Type**: `multipart/form-data` (`file`, `category`)
- **Response `201 Created`**: `{ "message": "string", "document": { "id", "originalName", "category", "encryptionAlgorithm", "checksumSha256" } }`

#### `GET /api/documents`
- **Purpose**: Lists metadata for owner's uploaded documents (does NOT transmit ciphertext or plaintext).
- **Auth**: Required (`OWNER` role)
- **Response `200 OK`**: `{ "documents": [ { "id", "originalName", "category", "fileSizeBytes", "assignedNomineesCount" } ] }`

#### `GET /api/documents/:id/download`
- **Purpose**: Owner downloads their own document. Fetches ciphertext from S3, unwraps DEK via KMS, decrypts ciphertext, validates SHA-256 checksum, and streams plaintext.
- **Auth**: Required (`OWNER` role)
- **Response `200 OK`**: Binary Stream with `Content-Disposition: attachment; filename="..."`

#### `DELETE /api/documents/:id`
- **Purpose**: Deletes document object from S3 and removes associated release rules.
- **Auth**: Required (`OWNER` role)
- **Response `200 OK`**: `{ "message": "Document and associated release policies deleted safely." }`

---

### Nominees & Release Policies (`/api/nominees` & `/api/release-rules`)

#### `GET /api/nominees`
- **Purpose**: Lists nominees appointed by owner.
- **Auth**: Required (`OWNER` role)

#### `POST /api/nominees`
- **Purpose**: Appoints a new nominee, generates a high-entropy invitation token, and dispatches SNS notification.
- **Auth**: Required (`OWNER` role)
- **Body**: `{ "fullName": "string", "email": "string", "phone": "string", "relationshipType": "string" }`

#### `POST /api/release-rules`
- **Purpose**: Establishes or updates release policy mapping a document to a nominee.
- **Auth**: Required (`OWNER` role)
- **Body**: `{ "documentId": "uuid", "nomineeId": "uuid", "accessDurationDays": 30 }`

---

### Nominee Access Portal (`/api/nominee`)

#### `GET /api/nominee/relationships`
- **Purpose**: Nominee views accounts who appointed them and the current state of their relationship.
- **Auth**: Required (`NOMINEE` role)

#### `GET /api/nominee/released-documents`
- **Purpose**: Nominee lists released documents granted to them. Strictly requires owner state to be `ACCESS_GRANTED`.
- **Auth**: Required (`NOMINEE` role)

#### `GET /api/nominee/released-documents/:id/download`
- **Purpose**: Nominee downloads an authorized released document. Performs resource-level check against `release_grants`, unwraps DEK via KMS, decrypts ciphertext, and logs audit event.
- **Auth**: Required (`NOMINEE` role)

---

### System Health & Monitoring (`/health`, `/ready`, `/api/admin`)

#### `GET /health`
- **Purpose**: Liveness probe for ALB Target Group. Returns `200 OK` with `{ "status": "UP" }`.

#### `GET /ready`
- **Purpose**: Readiness probe verifying database and KMS subsystem connectivity.

#### `GET /api/admin/system-health`
- **Purpose**: Operational dashboard displaying AWS component status, user count, and lifecycle distribution.
