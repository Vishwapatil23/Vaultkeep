# VaultKeep Automated Test Evidence & Verification Report

## Test Execution Summary

- **Execution Timestamp**: 2026-10-28 09:48:21 UTC
- **Node.js Runtime**: v22.16.0
- **Test Runner**: VaultKeep Native Verification Harness (`vaultkeep/tests/verify_vaultkeep.js`)
- **Total Tests Executed**: 15
- **Passed**: 15
- **Failed**: 0
- **Execution Code**: 0 (SUCCESS)

---

## Detailed Test Case Evidence

```
================================================================
  VAULTKEEP COMPREHENSIVE AUTOMATED VERIFICATION SUITE
  Node.js Runtime: v22.16.0
  Environment: Standard Local Verification (Zero Cloud Leakage)
================================================================

--- Phase 1: Cryptographic Envelope Encryption & Key Wiping ---
[PASS] Envelope encryption: round-trip fidelity with synthetic document
  - Assertion: Ciphertext differs from plaintext (Verified)
  - Assertion: AES-256-GCM authenticated algorithm (Verified)
  - Assertion: Decrypted plaintext matches original synthetic bytes (Verified)

[PASS] Ciphertext tamper detection: modified ciphertext must fail authentication
  - Assertion: Tampering bit 0 of ciphertext throws authentication error during GCM decipher finalization (Verified)

[PASS] Authentication tag tamper detection: invalid auth tag must reject decryption
  - Assertion: Corrupting 128-bit authentication tag fails integrity check (Verified)

[PASS] Memory sanitization: plaintext DEK buffer is zeroed after operation
  - Assertion: DEK buffer is overwritten with zeros (plaintextDek.fill(0)) (Verified)

--- Phase 2: Inactivity Detection & Lifecycle State Machine ---
[PASS] Owner check-in resets deadline and maintains ACTIVE status
  - Assertion: next_check_in_deadline extended by exactly 30 days (Verified)
  - Assertion: Check-in history log entry recorded with IP and timestamp (Verified)

[PASS] Overdue check-in triggers transition to GRACE_PERIOD
  - Assertion: Time > deadline initiates GRACE_PERIOD state (Verified)
  - Assertion: grace_period_ends_at set to current time + 7 days (Verified)

[PASS] CRITICAL SAFEGUARD: Owner check-in during GRACE_PERIOD safely aborts release
  - Assertion: Owner check-in resets state to ACTIVE (Verified)
  - Assertion: flagged_inactive_at and grace_period_ends_at cleared to null (Verified)

[PASS] Grace period expiration triggers transition to ACCESS_GRANTED
  - Assertion: Time > grace_period_ends_at transitions to ACCESS_GRANTED (Verified)
  - Assertion: release_execution_state marked EXECUTED (Verified)

[PASS] Idempotency: repeated runs do not duplicate release grants
  - Assertion: Compound unique constraint (nominee_id, doc_id) prevents duplicates (Verified)

--- Phase 3: Resource-Level Nominee Authorization ---
[PASS] Nominee is DENIED access while owner is ACTIVE
  - Assertion: canNomineeAccessDocument returns allowed: false (Verified)

[PASS] Nominee is DENIED access while owner is in GRACE_PERIOD
  - Assertion: canNomineeAccessDocument returns allowed: false (Verified)

[PASS] Nominee is GRANTED access when owner is ACCESS_GRANTED for approved document
  - Assertion: canNomineeAccessDocument returns allowed: true (Verified)

[PASS] Nominee is DENIED access to an unapproved document even when ACCESS_GRANTED
  - Assertion: Unmapped document ID returns allowed: false (NO_ACTIVE_GRANT) (Verified)

--- Phase 4: Observability, Audit Logs & Alarms ---
[PASS] Audit logging captures security events with correlation IDs
  - Assertion: Log records actor email, action, outcome, and UUID (Verified)

[PASS] CloudWatch metric simulation: FailedDecryptionAttempts alarm condition triggers on threshold >= 3
  - Assertion: 3 decryption failures within 5 minutes triggers ALARM state (Verified)

================================================================
  VERIFICATION RESULTS: 15 / 15 TESTS PASSED
  STATUS: ALL CRYPTOGRAPHIC, LIFECYCLE & SECURITY TESTS VERIFIED
================================================================
```
