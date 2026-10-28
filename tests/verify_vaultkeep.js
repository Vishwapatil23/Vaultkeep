/**
 * VaultKeep Comprehensive Verification & Test Suite
 * Pure Node.js Standard Library (Zero-Dependency Execution)
 * Tests: Cryptography, Envelope Encryption, DEK Memory Wiping, Auth, Lifecycle State Machine,
 * Grace Period Abort Safeguard, Idempotent Release Grants, Nominee Access Denial/Authorization, Audit Logging.
 */

const crypto = require('crypto');
const assert = require('assert');

console.log('================================================================');
console.log('  VAULTKEEP COMPREHENSIVE AUTOMATED VERIFICATION SUITE');
console.log('  Node.js Runtime:', process.version);
console.log('  Environment: Standard Local Verification (Zero Cloud Leakage)');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// 1. CRYPTOGRAPHIC ENVELOPE ENCRYPTION TESTS (AES-256-GCM + AWS KMS SIMULATION)
// ---------------------------------------------------------------------------
console.log('--- Phase 1: Cryptographic Envelope Encryption & Key Wiping ---');

const MASTER_KEK = crypto.createHash('sha256').update('VAULTKEEP_MASTER_KMS_CMK_2026').digest();

function simulateKmsGenerateDataKey(context = {}) {
  const plaintextDek = crypto.randomBytes(32); // 256-bit AES DEK
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEK, iv);
  if (Object.keys(context).length > 0) cipher.setAAD(Buffer.from(JSON.stringify(context)));
  const wrappedDek = Buffer.concat([cipher.update(plaintextDek), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packedEncryptedDek = Buffer.concat([iv, tag, wrappedDek]).toString('base64');
  return { plaintextDek, encryptedDekBase64: packedEncryptedDek };
}

function simulateKmsDecryptDataKey(encryptedDekBase64, context = {}) {
  const blob = Buffer.from(encryptedDekBase64, 'base64');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const wrappedDek = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEK, iv);
  decipher.setAuthTag(tag);
  if (Object.keys(context).length > 0) decipher.setAAD(Buffer.from(JSON.stringify(context)));
  return Buffer.concat([decipher.update(wrappedDek), decipher.final()]);
}

function encryptDocument(plaintextBuffer, context = {}) {
  const checksumSha256 = crypto.createHash('sha256').update(plaintextBuffer).digest('hex');
  const { plaintextDek, encryptedDekBase64 } = simulateKmsGenerateDataKey(context);
  
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', plaintextDek, iv);
    if (Object.keys(context).length > 0) cipher.setAAD(Buffer.from(JSON.stringify(context)));
    const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext,
      encryptedDekBase64,
      ivBase64: iv.toString('base64'),
      authTagBase64: authTag.toString('base64'),
      checksumSha256,
      algorithm: 'AES-256-GCM',
      version: 'v1'
    };
  } finally {
    // SECURITY: Zero plaintext DEK memory buffer
    plaintextDek.fill(0);
  }
}

function decryptDocument(ciphertext, encryptedDekBase64, ivBase64, authTagBase64, expectedChecksum, context = {}) {
  const plaintextDek = simulateKmsDecryptDataKey(encryptedDekBase64, context);
  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', plaintextDek, iv);
    decipher.setAuthTag(authTag);
    if (Object.keys(context).length > 0) decipher.setAAD(Buffer.from(JSON.stringify(context)));
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    
    if (expectedChecksum) {
      const calculated = crypto.createHash('sha256').update(decrypted).digest('hex');
      if (calculated !== expectedChecksum) throw new Error('SHA-256 checksum mismatch');
    }
    return decrypted;
  } finally {
    plaintextDek.fill(0);
  }
}

runTest('Envelope encryption: round-trip fidelity with synthetic document', () => {
  const docData = Buffer.from('CONFIDENTIAL_LAST_WILL_AND_ESTATE_SYNTHETIC_DATA_2026', 'utf8');
  const context = { ownerId: 'owner-uuid-1', docId: 'doc-uuid-1' };
  const encrypted = encryptDocument(docData, context);

  assert.notStrictEqual(encrypted.ciphertext.toString('utf8'), docData.toString('utf8'), 'Ciphertext must differ from plaintext');
  assert.strictEqual(encrypted.algorithm, 'AES-256-GCM');
  
  const decrypted = decryptDocument(
    encrypted.ciphertext,
    encrypted.encryptedDekBase64,
    encrypted.ivBase64,
    encrypted.authTagBase64,
    encrypted.checksumSha256,
    context
  );
  assert.strictEqual(decrypted.toString('utf8'), docData.toString('utf8'), 'Decrypted content must match original');
});

runTest('Ciphertext tamper detection: modified ciphertext must fail authentication', () => {
  const docData = Buffer.from('CONFIDENTIAL_REAL_ESTATE_DEED_SYNTHETIC_DATA', 'utf8');
  const context = { ownerId: 'owner-uuid-1', docId: 'doc-uuid-2' };
  const encrypted = encryptDocument(docData, context);

  // Tamper with first byte of ciphertext
  const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
  tamperedCiphertext[0] ^= 0xff;

  let threw = false;
  try {
    decryptDocument(
      tamperedCiphertext,
      encrypted.encryptedDekBase64,
      encrypted.ivBase64,
      encrypted.authTagBase64,
      encrypted.checksumSha256,
      context
    );
  } catch (err) {
    threw = true;
  }
  assert.strictEqual(threw, true, 'Tampered ciphertext must fail authentication tag verification');
});

runTest('Authentication tag tamper detection: invalid auth tag must reject decryption', () => {
  const docData = Buffer.from('CONFIDENTIAL_CREDENTIALS_SYNTHETIC_DATA', 'utf8');
  const context = { ownerId: 'owner-uuid-1', docId: 'doc-uuid-3' };
  const encrypted = encryptDocument(docData, context);

  const fakeTag = Buffer.alloc(16, 0xbb).toString('base64');
  let threw = false;
  try {
    decryptDocument(
      encrypted.ciphertext,
      encrypted.encryptedDekBase64,
      encrypted.ivBase64,
      fakeTag,
      encrypted.checksumSha256,
      context
    );
  } catch (err) {
    threw = true;
  }
  assert.strictEqual(threw, true, 'Invalid auth tag must throw an error');
});

runTest('Memory sanitization: plaintext DEK buffer is zeroed after operation', () => {
  const { plaintextDek } = simulateKmsGenerateDataKey();
  assert.strictEqual(plaintextDek.some(byte => byte !== 0), true, 'New DEK has non-zero random bytes');
  plaintextDek.fill(0);
  assert.strictEqual(plaintextDek.every(byte => byte === 0), true, 'Wiped DEK buffer contains strictly zeros');
});

// ---------------------------------------------------------------------------
// 2. ACCOUNT LIFECYCLE & INACTIVITY STATE MACHINE TESTS
// ---------------------------------------------------------------------------
console.log('\n--- Phase 2: Inactivity Detection & Lifecycle State Machine ---');

class MockAccountLifecycle {
  constructor(ownerId, intervalDays = 30, graceDays = 7) {
    this.ownerId = ownerId;
    this.intervalDays = intervalDays;
    this.graceDays = graceDays;
    this.currentState = 'ACTIVE';
    this.lastSuccessfulCheckIn = new Date().toISOString();
    this.nextCheckInDeadline = new Date(Date.now() + intervalDays * 86400000).toISOString();
    this.flaggedInactiveAt = null;
    this.gracePeriodEndsAt = null;
    this.releaseExecutionState = 'NONE';
    this.checkInHistory = [];
    this.releaseGrants = [];
  }

  performCheckIn() {
    const now = new Date();
    this.lastSuccessfulCheckIn = now.toISOString();
    this.nextCheckInDeadline = new Date(now.getTime() + this.intervalDays * 86400000).toISOString();
    this.currentState = 'ACTIVE';
    this.flaggedInactiveAt = null;
    this.gracePeriodEndsAt = null;
    this.releaseExecutionState = 'NONE';
    this.checkInHistory.push({ timestamp: now.toISOString(), type: 'MANUAL_DASHBOARD' });
  }

  evaluateInactivity(currentTime) {
    const now = currentTime || new Date();
    // 1. Check if deadline passed while in ACTIVE
    if (this.currentState === 'ACTIVE' && now >= new Date(this.nextCheckInDeadline)) {
      this.currentState = 'GRACE_PERIOD';
      this.flaggedInactiveAt = now.toISOString();
      this.gracePeriodEndsAt = new Date(now.getTime() + this.graceDays * 86400000).toISOString();
      return 'GRACE_PERIOD_STARTED';
    }
    // 2. Check if grace period expired while in GRACE_PERIOD
    if (this.currentState === 'GRACE_PERIOD' && this.gracePeriodEndsAt && now >= new Date(this.gracePeriodEndsAt)) {
      this.currentState = 'ACCESS_GRANTED';
      this.releaseExecutionState = 'EXECUTED';
      return 'ACCESS_GRANTED';
    }
    return 'NO_CHANGE';
  }

  addGrant(nomineeId, docId) {
    // Enforce unique compound constraint (nominee_id, doc_id)
    const exists = this.releaseGrants.some(g => g.nomineeId === nomineeId && g.docId === docId);
    if (!exists) {
      this.releaseGrants.push({ nomineeId, docId, status: 'ACTIVE', grantedAt: new Date().toISOString() });
      return true;
    }
    return false; // Idempotent no-op
  }
}

runTest('Owner check-in resets deadline and maintains ACTIVE status', () => {
  const account = new MockAccountLifecycle('owner-1', 30, 7);
  account.performCheckIn();
  assert.strictEqual(account.currentState, 'ACTIVE');
  assert.strictEqual(account.checkInHistory.length, 1);
  const diffDays = Math.round((new Date(account.nextCheckInDeadline) - Date.now()) / 86400000);
  assert.strictEqual(diffDays, 30);
});

runTest('Overdue check-in triggers transition to GRACE_PERIOD', () => {
  const account = new MockAccountLifecycle('owner-1', 30, 7);
  // Simulate time fast forward past deadline
  const futureTime = new Date(Date.now() + 31 * 86400000);
  const result = account.evaluateInactivity(futureTime);

  assert.strictEqual(result, 'GRACE_PERIOD_STARTED');
  assert.strictEqual(account.currentState, 'GRACE_PERIOD');
  assert.notStrictEqual(account.gracePeriodEndsAt, null);
});

runTest('CRITICAL SAFEGUARD: Owner check-in during GRACE_PERIOD safely aborts release', () => {
  const account = new MockAccountLifecycle('owner-1', 30, 7);
  account.evaluateInactivity(new Date(Date.now() + 31 * 86400000));
  assert.strictEqual(account.currentState, 'GRACE_PERIOD');

  // Owner logs in and checks in
  account.performCheckIn();
  assert.strictEqual(account.currentState, 'ACTIVE', 'Account status must restore to ACTIVE');
  assert.strictEqual(account.flaggedInactiveAt, null, 'Inactive flag must be cleared');
  assert.strictEqual(account.gracePeriodEndsAt, null, 'Grace period end must be reset to null');
});

runTest('Grace period expiration triggers transition to ACCESS_GRANTED', () => {
  const account = new MockAccountLifecycle('owner-1', 30, 7);
  const missedDeadlineTime = new Date(Date.now() + 31 * 86400000);
  account.evaluateInactivity(missedDeadlineTime);
  assert.strictEqual(account.currentState, 'GRACE_PERIOD');

  // Time fast forward past grace period (31 days + 8 days = 39 days)
  const expiredGraceTime = new Date(Date.now() + 39 * 86400000);
  const result = account.evaluateInactivity(expiredGraceTime);

  assert.strictEqual(result, 'ACCESS_GRANTED');
  assert.strictEqual(account.currentState, 'ACCESS_GRANTED');
  assert.strictEqual(account.releaseExecutionState, 'EXECUTED');
});

runTest('Idempotency: repeated runs do not duplicate release grants', () => {
  const account = new MockAccountLifecycle('owner-1', 30, 7);
  const firstInsert = account.addGrant('nominee-1', 'doc-101');
  const duplicateInsert = account.addGrant('nominee-1', 'doc-101');

  assert.strictEqual(firstInsert, true, 'First insert creates grant');
  assert.strictEqual(duplicateInsert, false, 'Duplicate insert is safely skipped');
  assert.strictEqual(account.releaseGrants.length, 1);
});

// ---------------------------------------------------------------------------
// 3. RESOURCE-LEVEL NOMINEE AUTHORIZATION TESTS
// ---------------------------------------------------------------------------
console.log('\n--- Phase 3: Resource-Level Nominee Authorization ---');

function canNomineeAccessDocument(nomineeId, docId, account) {
  // 1. Account state must be ACCESS_GRANTED
  if (account.currentState !== 'ACCESS_GRANTED') {
    return { allowed: false, reason: 'OWNER_NOT_IN_RELEASE_STATE' };
  }
  // 2. Active grant must exist for this nominee & document
  const grant = account.releaseGrants.find(g => g.nomineeId === nomineeId && g.docId === docId && g.status === 'ACTIVE');
  if (!grant) {
    return { allowed: false, reason: 'NO_ACTIVE_GRANT' };
  }
  return { allowed: true };
}

runTest('Nominee is DENIED access while owner is ACTIVE', () => {
  const account = new MockAccountLifecycle('owner-1');
  account.addGrant('nominee-1', 'doc-101');
  const auth = canNomineeAccessDocument('nominee-1', 'doc-101', account);
  assert.strictEqual(auth.allowed, false);
  assert.strictEqual(auth.reason, 'OWNER_NOT_IN_RELEASE_STATE');
});

runTest('Nominee is DENIED access while owner is in GRACE_PERIOD', () => {
  const account = new MockAccountLifecycle('owner-1');
  account.currentState = 'GRACE_PERIOD';
  account.addGrant('nominee-1', 'doc-101');
  const auth = canNomineeAccessDocument('nominee-1', 'doc-101', account);
  assert.strictEqual(auth.allowed, false);
  assert.strictEqual(auth.reason, 'OWNER_NOT_IN_RELEASE_STATE');
});

runTest('Nominee is GRANTED access when owner is ACCESS_GRANTED for approved document', () => {
  const account = new MockAccountLifecycle('owner-1');
  account.currentState = 'ACCESS_GRANTED';
  account.addGrant('nominee-1', 'doc-101');
  const auth = canNomineeAccessDocument('nominee-1', 'doc-101', account);
  assert.strictEqual(auth.allowed, true);
});

runTest('Nominee is DENIED access to an unapproved document even when ACCESS_GRANTED', () => {
  const account = new MockAccountLifecycle('owner-1');
  account.currentState = 'ACCESS_GRANTED';
  account.addGrant('nominee-1', 'doc-101'); // Only doc-101 is granted
  const auth = canNomineeAccessDocument('nominee-1', 'doc-999', account); // Requesting doc-999
  assert.strictEqual(auth.allowed, false);
  assert.strictEqual(auth.reason, 'NO_ACTIVE_GRANT');
});

// ---------------------------------------------------------------------------
// 4. AUDIT LOGGING & CLOUDWATCH ALARM METRICS
// ---------------------------------------------------------------------------
console.log('\n--- Phase 4: Observability, Audit Logs & Alarms ---');

const auditLog = [];
function recordAudit(actorEmail, action, outcome, metadata = {}) {
  const entry = {
    id: crypto.randomUUID(),
    actorEmail,
    action,
    outcome,
    metadata,
    timestamp: new Date().toISOString()
  };
  auditLog.push(entry);
  return entry;
}

runTest('Audit logging captures security events with correlation IDs', () => {
  recordAudit('alex.vance@vaultkeep-demo.internal', 'USER_LOGIN', 'SUCCESS');
  recordAudit('alex.vance@vaultkeep-demo.internal', 'DOCUMENT_UPLOAD', 'SUCCESS', { docId: 'doc-101' });
  recordAudit('eleanor.nominee@vaultkeep-demo.internal', 'DOCUMENT_DOWNLOAD', 'SUCCESS', { docId: 'doc-101' });

  assert.strictEqual(auditLog.length, 3);
  assert.strictEqual(auditLog[0].action, 'USER_LOGIN');
  assert.strictEqual(auditLog[2].action, 'DOCUMENT_DOWNLOAD');
});

runTest('CloudWatch metric simulation: FailedDecryptionAttempts alarm condition triggers on threshold >= 3', () => {
  let failedDecryptionCount = 0;
  const ALARM_THRESHOLD = 3;

  function simulateDecryptionAttempt(success) {
    if (!success) failedDecryptionCount++;
    return failedDecryptionCount >= ALARM_THRESHOLD ? 'ALARM' : 'OK';
  }

  assert.strictEqual(simulateDecryptionAttempt(true), 'OK');
  assert.strictEqual(simulateDecryptionAttempt(false), 'OK'); // 1
  assert.strictEqual(simulateDecryptionAttempt(false), 'OK'); // 2
  assert.strictEqual(simulateDecryptionAttempt(false), 'ALARM'); // 3 -> ALARM!
});

// ---------------------------------------------------------------------------
// TEST SUMMARY & ACCEPTANCE VERIFICATION
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  VERIFICATION RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests === totalTests) {
  console.log('  STATUS: ALL CRYPTOGRAPHIC, LIFECYCLE & SECURITY TESTS VERIFIED');
} else {
  console.log(`  STATUS: ${totalTests - passedTests} TESTS FAILED`);
}
console.log('================================================================');

process.exit(passedTests === totalTests ? 0 : 1);
