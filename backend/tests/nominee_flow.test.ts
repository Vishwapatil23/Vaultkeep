import request from 'supertest';
import app from '../src/server';

describe('VaultKeep Dynamic Owner & Nominee SNS Flow Tests', () => {
  const ownerEmail = 'owner.carol2026@gmail.com';
  const ownerPassword = 'OwnerSecurePass2026!';
  const ownerName = 'Carol Danvers';

  const nomineeEmail = 'nominee.david2026@outlook.com';
  const nomineePassword = 'NomineeSecurePass2026!';
  const nomineeName = 'David Miller';

  let ownerToken: string;
  let invitationToken: string;
  let invitationLink: string;
  let nomineeToken: string;

  // 1. Any valid email address can register as owner
  it('1. Any valid email address can register as an owner', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: ownerName,
        email: ownerEmail,
        password: ownerPassword,
        role: 'OWNER'
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(ownerEmail);
    expect(res.body.user.role).toBe('OWNER');
    ownerToken = res.body.token;
  });

  // 1b. Login with the newly registered owner email
  it('1b. Newly registered owner can log in successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: ownerEmail,
        password: ownerPassword
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(ownerEmail);
  });

  // 8a. Rejects invalid email address for nominee
  it('8a. Should reject invalid email format with 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/nominees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Invalid User',
        email: 'invalid-email-address',
        relationshipType: 'Friend'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  // 8b. Rejects owner nominating their own email address
  it('8b. Should reject owner attempting to nominate their own email address', async () => {
    const res = await request(app)
      .post('/api/nominees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Self Nomination',
        email: ownerEmail,
        relationshipType: 'Other'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot designate your own/i);
  });

  // 2, 4, 5, 6. Owner enters any valid email as nominee, generates secure token and link
  it('2, 4, 5, 6. Owner can enter any valid email as nominee, generates secure token and invitation link', async () => {
    const res = await request(app)
      .post('/api/nominees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: nomineeName,
        email: nomineeEmail,
        relationshipType: 'Family'
      });

    expect(res.status).toBe(201);
    expect(res.body.nominee).toBeDefined();
    expect(res.body.nominee.email).toBe(nomineeEmail);
    expect(res.body.nominee.invitation_status).toBe('PENDING');

    // Requirement 4: High-entropy invitation token
    expect(res.body.invitationToken).toBeDefined();
    expect(res.body.invitationToken.length).toBeGreaterThanOrEqual(32);
    invitationToken = res.body.invitationToken;

    // Requirement 6: Accept Invitation link
    expect(res.body.invitationLink).toBeDefined();
    expect(res.body.invitationLink).toContain(invitationToken);
    invitationLink = res.body.invitationLink;
  });

  // 8c. Handles duplicate nominee properly
  it('8c. Should reject duplicate nominee with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/nominees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: nomineeName,
        email: nomineeEmail,
        relationshipType: 'Family'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been added/i);
  });

  // 7a. Verification of invitation token
  it('7a. Should verify invitation token and return owner details', async () => {
    const res = await request(app)
      .get(`/api/nominees/invitations/verify?token=${invitationToken}`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.nomineeEmail).toBe(nomineeEmail);
    expect(res.body.ownerName).toBe(ownerName);
  });

  // 7b. Nominee accepts invitation and establishes nominee account
  it('7b. Nominee accepts invitation using the token and sets their password', async () => {
    const res = await request(app)
      .post('/api/nominees/invitations/accept')
      .send({
        token: invitationToken,
        password: nomineePassword,
        name: nomineeName
      });

    expect(res.status).toBe(200);
    expect(res.body.nominee.invitation_status).toBe('ACCEPTED');
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(nomineeEmail);
    expect(res.body.user.role).toBe('NOMINEE');
    nomineeToken = res.body.token;
  });

  // 12. Complete flow: Nominee can access nominee relationships portal
  it('12. Verified nominee can access portal and view their relationship to owner', async () => {
    const res = await request(app)
      .get('/api/nominee/relationships')
      .set('Authorization', `Bearer ${nomineeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.relationships).toBeDefined();
    const rel = res.body.relationships.find((r: any) => r.ownerName === ownerName);
    expect(rel).toBeDefined();
    expect(rel.invitationStatus).toBe('ACCEPTED');
  });
});
