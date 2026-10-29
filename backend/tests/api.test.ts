import request from 'supertest';
import app from '../src/server';
import { memoryDb } from '../src/db';
import { LifecycleService } from '../src/services/lifecycleService';

jest.setTimeout(30000);

describe('VaultKeep End-to-End API & Lifecycle State Machine Tests', () => {
  let ownerToken: string;
  let nomineeToken: string;
  let uploadedDocId: string;
  const ownerEmail = 'alex.vance@vaultkeep-demo.internal';
  const nomineeEmail = 'eleanor.nominee@vaultkeep-demo.internal';
  const password = 'Password123!';

  beforeAll(async () => {
    // 1. Login as synthetic owner
    const ownerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerEmail, password });
    expect(ownerRes.status).toBe(200);
    ownerToken = ownerRes.body.token;

    // 2. Login as synthetic nominee
    const nomineeRes = await request(app)
      .post('/api/auth/login')
      .send({ email: nomineeEmail, password });
    expect(nomineeRes.status).toBe(200);
    nomineeToken = nomineeRes.body.token;
  });

  it('GET /health should return 200 UP for ALB probes', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
  });

  it('Owner should be able to perform check-in and extend deadline', async () => {
    const res = await request(app)
      .post('/api/check-ins')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Check-in confirmed');
    expect(res.body.lifecycle.current_state).toBe('ACTIVE');
  });

  it('Owner should be able to upload an encrypted document', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('category', 'LEGAL')
      .attach('file', Buffer.from('CONFIDENTIAL_LAST_WILL_SYNTHETIC_DATA'), 'synthetic_test_will.txt');

    expect(res.status).toBe(201);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.originalName).toBe('synthetic_test_will.txt');
    expect(res.body.document.encryptionAlgorithm).toBe('AES-256-GCM');
    uploadedDocId = res.body.document.id;
  });

  it('Nominee should NOT have access to released documents while owner is ACTIVE', async () => {
    const res = await request(app)
      .get('/api/nominee/released-documents')
      .set('Authorization', `Bearer ${nomineeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.releasedDocuments).toHaveLength(0);
  });

  it('Lifecycle Engine should transition ACTIVE to GRACE_PERIOD when deadline passes', async () => {
    const ownerLifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === '11111111-1111-1111-1111-111111111111');
    expect(ownerLifecycle).toBeDefined();

    // Set deadline in the past
    ownerLifecycle!.next_check_in_deadline = new Date(Date.now() - 60000).toISOString();

    const evalResult = await LifecycleService.evaluateInactivityEngine();
    expect(evalResult.gracePeriodStartedCount).toBeGreaterThanOrEqual(1);

    expect(ownerLifecycle!.current_state).toBe('GRACE_PERIOD');
    expect(ownerLifecycle!.grace_period_ends_at).toBeDefined();
  });

  it('Owner checking in during GRACE_PERIOD should safely ABORT pending release', async () => {
    const res = await request(app)
      .post('/api/check-ins')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const ownerLifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === '11111111-1111-1111-1111-111111111111');
    expect(ownerLifecycle!.current_state).toBe('ACTIVE');
    expect(ownerLifecycle!.flagged_inactive_at).toBeNull();
  });

  it('When GRACE_PERIOD expires, engine transitions to ACCESS_GRANTED and creates grants', async () => {
    const ownerLifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === '11111111-1111-1111-1111-111111111111');
    ownerLifecycle!.current_state = 'GRACE_PERIOD';
    ownerLifecycle!.grace_period_ends_at = new Date(Date.now() - 10000).toISOString();
    ownerLifecycle!.release_execution_state = 'NONE';

    // Add a release rule for Eleanor
    const doc = { id: uploadedDocId || '33333333-3333-3333-3333-333333333333' };
    if (doc) {
      await request(app)
        .post('/api/release-rules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          documentId: doc.id,
          nomineeId: '55555555-5555-5555-5555-555555555555',
          accessDurationDays: 30
        });
    }

    const evalResult = await LifecycleService.evaluateInactivityEngine();
    expect(evalResult.releasedCount).toBeGreaterThanOrEqual(1);
    expect(ownerLifecycle!.current_state).toBe('ACCESS_GRANTED');

    // Nominee now sees the released document!
    const nomineeDocsRes = await request(app)
      .get('/api/nominee/released-documents')
      .set('Authorization', `Bearer ${nomineeToken}`);

    expect(nomineeDocsRes.status).toBe(200);
    expect(nomineeDocsRes.body.releasedDocuments.length).toBeGreaterThanOrEqual(1);
  });
});
