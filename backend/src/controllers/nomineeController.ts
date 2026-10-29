import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { query, memoryDb, saveMemoryDb } from '../db';
import { NotificationService } from '../services/notificationService';
import { AuditService } from '../services/auditService';
import { EnvelopeEncryptionService } from '../crypto/envelopeEncryption';
import { StorageService } from '../services/storageService';

const JWT_SECRET = process.env.JWT_SECRET || 'vaultkeep_jwt_super_secure_dev_secret_key_2026_x89a';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class NomineeController {
  // ================= OWNER OPERATIONS =================

  public static async getNominees(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      // Reconcile status in RDS if nominee registered an account
      await query(
        `UPDATE nominees n
         SET invitation_status = 'ACCEPTED',
             nominee_user_id = u.id,
             verified_at = COALESCE(n.verified_at, NOW()),
             updated_at = NOW()
         FROM users u
         WHERE LOWER(n.email) = LOWER(u.email)
           AND n.owner_id = $1
           AND n.invitation_status = 'PENDING'`,
        [req.user.id]
      );

      // Query nominees from RDS
      const result = await query(
        `SELECT n.id, n.owner_id, n.nominee_user_id, n.full_name, n.email, n.phone,
                n.relationship_type, n.invitation_status, n.invitation_expires_at,
                n.verified_at, n.created_at,
                (SELECT COUNT(*)::int FROM document_release_rules r WHERE r.nominee_id = n.id AND r.rule_status = 'ACTIVE') as assigned_documents_count
         FROM nominees n
         WHERE n.owner_id = $1
         ORDER BY n.created_at ASC`,
        [req.user.id]
      );

      if (result.rows) {
        // Enriched with SNS confirmation status
        const enriched = await Promise.all(result.rows.map(async (n: any) => {
          let snsStatus = 'CONFIRMED';
          if (n.invitation_status === 'PENDING') {
            const check = await NotificationService.checkSubscriptionStatus(n.email);
            snsStatus = check.status;
          }
          return {
            id: n.id,
            fullName: n.full_name,
            email: n.email,
            phone: n.phone,
            relationshipType: n.relationship_type,
            invitationStatus: n.invitation_status,
            invitationExpiresAt: n.invitation_expires_at,
            assignedDocumentsCount: n.assigned_documents_count || 0,
            verifiedAt: n.verified_at,
            createdAt: n.created_at,
            snsStatus
          };
        }));

        res.json({ nominees: enriched });
        return;
      }
    } catch (err: any) {
      console.warn('[NomineeController:Get:Warning]', err.message);
    }

    // Fallback to memory
    const nominees = memoryDb.nominees.filter(n => n.owner_id === req.user?.id);
    const enriched = nominees.map(n => {
      const assignedRules = memoryDb.document_release_rules.filter(
        r => r.nominee_id === n.id && r.rule_status === 'ACTIVE'
      );
      return {
        id: n.id,
        fullName: n.full_name,
        email: n.email,
        phone: n.phone,
        relationshipType: n.relationship_type,
        invitationStatus: n.invitation_status,
        invitationExpiresAt: n.invitation_expires_at,
        assignedDocumentsCount: assignedRules.length,
        verifiedAt: n.verified_at,
        createdAt: n.created_at,
        snsStatus: 'CONFIRMED'
      };
    });

    res.json({ nominees: enriched });
  }

  public static async addNominee(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { fullName, email, phone, relationshipType = 'Family' } = req.body;
    if (!fullName || !email) {
      res.status(400).json({ error: 'Nominee full name and email are required fields.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Email format validation
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address (e.g., name@example.com).' });
      return;
    }

    // 2. Prevent self-nomination
    if (normalizedEmail === req.user.email.toLowerCase()) {
      res.status(400).json({ error: 'You cannot designate your own email address as a nominee.' });
      return;
    }

    // 3. Prevent duplicate nominees for the same owner in RDS
    let duplicate = false;
    try {
      const existing = await query('SELECT id FROM nominees WHERE owner_id = $1 AND LOWER(email) = LOWER($2)', [req.user.id, normalizedEmail]);
      if (existing.rows && existing.rows.length > 0) duplicate = true;
    } catch {
      duplicate = !!memoryDb.nominees.find(n => n.owner_id === req.user?.id && n.email.toLowerCase() === normalizedEmail);
    }

    if (duplicate) {
      res.status(409).json({ error: `A nominee with email '${normalizedEmail}' has already been added to your vault.` });
      return;
    }

    // Generate high-entropy 256-bit invitation token
    const rawInvitationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const nomineeId = uuidv4();
    const now = new Date();

    // Check if user already exists
    let linkedUserId: string | null = null;
    try {
      const uRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
      if (uRes.rows && uRes.rows.length > 0) linkedUserId = uRes.rows[0].id;
    } catch {
      const memUser = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
      if (memUser) linkedUserId = memUser.id;
    }

    const invitationStatus = linkedUserId ? 'ACCEPTED' : 'PENDING';
    const verifiedAt = linkedUserId ? now : null;

    // 4. Persist in Amazon RDS PostgreSQL
    try {
      await query(
        `INSERT INTO nominees (id, owner_id, nominee_user_id, full_name, email, phone, relationship_type, invitation_token_hash, invitation_status, invitation_expires_at, verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          nomineeId,
          req.user.id,
          linkedUserId,
          fullName.trim(),
          normalizedEmail,
          phone ? phone.trim() : null,
          relationshipType,
          tokenHash,
          invitationStatus,
          expiresAt,
          verifiedAt,
          now,
          now
        ]
      );
    } catch (err: any) {
      console.error('[NomineeController:Add:DBError]', err.message);
    }

    // Mirror in memory
    const newNominee = {
      id: nomineeId,
      owner_id: req.user.id,
      nominee_user_id: linkedUserId,
      full_name: fullName.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : null,
      relationship_type: relationshipType,
      invitation_token_hash: tokenHash,
      invitation_status: invitationStatus,
      invitation_expires_at: expiresAt.toISOString(),
      verified_at: verifiedAt ? verifiedAt.toISOString() : null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };
    memoryDb.nominees.push(newNominee);
    saveMemoryDb();

    // Build accept invitation link for the email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationLink = `${frontendUrl}/?tab=accept-invitation&token=${rawInvitationToken}&email=${encodeURIComponent(normalizedEmail)}`;

    const subject = 'VaultKeep nominee invitation';
    const messageBody = `Hi ${fullName.trim()},\n` +
      `${req.user.name} invited you to be a nominee in their VaultKeep digital legacy vault.\n\n` +
      `Accept invitation:\n${invitationLink}\n\n` +
      `This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.\n` +
      `— The VaultKeep Team`;

    // Send invitation notification via AWS SNS
    console.log(`[NomineeController] Initiating invitation email dispatch to ${normalizedEmail} via AWS SNS...`);
    const notifResult = await NotificationService.sendNotification({
      recipientEmail: normalizedEmail,
      recipientRole: 'NOMINEE',
      notificationType: 'INVITATION_SENT',
      ownerId: req.user.id,
      eventReferenceId: nomineeId,
      subject,
      messageBody
    });

    await AuditService.recordEvent({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'NOMINEE_INVITED',
      resourceType: 'NOMINEE',
      resourceId: nomineeId,
      outcome: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        nomineeEmail: normalizedEmail,
        relationshipType,
        deliveryStatus: notifResult.deliveryStatus,
        subscriptionStatus: notifResult.subscriptionStatus
      }
    });

    const isPendingSns = notifResult.deliveryStatus === 'PENDING_SNS_CONFIRMATION';
    const responseMsg = isPendingSns
      ? `Nominee added. AWS SNS subscription confirmation email sent to ${normalizedEmail}. Note: Nominee must click "Confirm subscription" in that email before SNS delivers topic messages. You can also share the direct link below.`
      : `Nominee added and invitation email dispatched via AWS SNS.`;

    res.status(201).json({
      message: responseMsg,
      nominee: newNominee,
      invitationToken: rawInvitationToken,
      invitationLink,
      snsStatus: notifResult.subscriptionStatus,
      deliveryStatus: notifResult.deliveryStatus,
      requiresSnsConfirmation: isPendingSns
    });
  }

  public static async deleteNominee(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;

    // Delete in RDS
    try {
      await query(`DELETE FROM nominees WHERE id = $1 AND owner_id = $2`, [id, req.user.id]);
      await query(`DELETE FROM document_release_rules WHERE nominee_id = $1`, [id]);
      await query(`DELETE FROM release_grants WHERE nominee_id = $1`, [id]);
    } catch (err: any) {
      console.warn('[NomineeController:Delete:DBError]', err.message);
    }

    const nomineeIndex = memoryDb.nominees.findIndex(n => n.id === id && n.owner_id === req.user?.id);
    if (nomineeIndex !== -1) {
      const nominee = memoryDb.nominees[nomineeIndex];
      memoryDb.nominees.splice(nomineeIndex, 1);
      memoryDb.document_release_rules = memoryDb.document_release_rules.filter(r => r.nominee_id !== id);
      memoryDb.release_grants = memoryDb.release_grants.filter(g => g.nominee_id !== id);
      saveMemoryDb();

      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'NOMINEE_RELATIONSHIP_REVOKED',
        resourceType: 'NOMINEE',
        resourceId: id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { nomineeEmail: nominee.email }
      });
    }

    res.json({ message: 'Nominee relationship and all associated release rules revoked.' });
  }

  // ================= INVITATION WORKFLOW =================

  public static async verifyInvitationToken(req: Request, res: Response): Promise<void> {
    const token = (req.query.token as string || req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Invitation token is required.' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    let nominee: any = null;
    let owner: any = null;

    try {
      const resNom = await query(
        `SELECT n.*, u.name as owner_name, u.email as owner_email
         FROM nominees n
         JOIN users u ON u.id = n.owner_id
         WHERE n.invitation_token_hash = $1`,
        [tokenHash]
      );
      if (resNom.rows && resNom.rows.length > 0) {
        nominee = resNom.rows[0];
        owner = { name: nominee.owner_name, email: nominee.owner_email };
      }
    } catch {
      nominee = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);
      if (nominee) owner = memoryDb.users.find(u => u.id === nominee.owner_id);
    }

    if (!nominee) {
      nominee = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);
      if (nominee) owner = memoryDb.users.find(u => u.id === nominee.owner_id);
    }

    if (!nominee) {
      res.status(404).json({ error: 'Invalid or already accepted invitation token.' });
      return;
    }

    if (new Date() > new Date(nominee.invitation_expires_at)) {
      res.status(410).json({ error: 'This invitation token has expired.' });
      return;
    }

    res.json({
      valid: true,
      nomineeEmail: nominee.email,
      nomineeName: nominee.full_name,
      relationshipType: nominee.relationship_type,
      ownerName: owner?.name || 'Account Owner',
      ownerEmail: owner?.email,
      expiresAt: nominee.invitation_expires_at
    });
  }

  public static async acceptInvitation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { token, password, name } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Invitation token is required.' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    let nominee: any = null;

    try {
      const resNom = await query('SELECT * FROM nominees WHERE invitation_token_hash = $1', [tokenHash]);
      if (resNom.rows && resNom.rows.length > 0) nominee = resNom.rows[0];
    } catch {
      nominee = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);
    }

    if (!nominee) {
      nominee = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);
    }

    if (!nominee) {
      await AuditService.recordSecurityEvent(
        'INVALID_INVITATION_TOKEN',
        'ANONYMOUS',
        { tokenHash },
        req.ip,
        req.headers['user-agent']
      );
      res.status(404).json({ error: 'Invalid, already accepted, or non-existent invitation token.' });
      return;
    }

    if (new Date() > new Date(nominee.invitation_expires_at)) {
      res.status(410).json({ error: 'This invitation token has expired.' });
      return;
    }

    let authUser = req.user;
    let issuedJwt: string | undefined;
    const normalizedEmail = nominee.email.toLowerCase();
    const now = new Date();

    // If nominee user is not currently logged in, check if existing account exists or if optional password was provided
    if (!authUser) {
      let existingUser: any = null;
      try {
        const uRes = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
        if (uRes.rows && uRes.rows.length > 0) existingUser = uRes.rows[0];
      } catch {
        existingUser = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);
      }

      if (existingUser) {
        if (password) {
          const isMatch = await bcrypt.compare(password, existingUser.password_hash);
          if (!isMatch) {
            res.status(401).json({ error: 'Invalid password for this existing nominee account.' });
            return;
          }
        }
        authUser = {
          id: existingUser.id,
          email: existingUser.email,
          role: existingUser.role,
          name: existingUser.name
        };
      } else if (password && password.length >= 8) {
        // Optional password provided: register new nominee portal account
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
        const password_hash = await bcrypt.hash(password, saltRounds);
        const userId = uuidv4();
        const userName = (name || nominee.full_name || 'Nominee').trim();

        try {
          await query(
            `INSERT INTO users (id, name, email, password_hash, role, account_status, contact_verified, last_check_in_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'NOMINEE', 'ACTIVE', true, $5, $6, $7)`,
            [userId, userName, normalizedEmail, password_hash, now, now, now]
          );
        } catch (err: any) {
          console.warn('[NomineeController:CreateUser:Warning]', err.message);
        }

        memoryDb.users.push({
          id: userId,
          name: userName,
          email: normalizedEmail,
          password_hash,
          role: 'NOMINEE' as const,
          account_status: 'ACTIVE',
          contact_verified: true,
          last_check_in_at: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        });

        authUser = {
          id: userId,
          email: normalizedEmail,
          role: 'NOMINEE',
          name: userName
        };
      }

      if (authUser) {
        issuedJwt = jwt.sign(
          { id: authUser.id, email: authUser.email, role: authUser.role, name: authUser.name },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
      }
    }

    // Update nominee in RDS PostgreSQL
    try {
      await query(
        `UPDATE nominees
         SET invitation_status = 'ACCEPTED',
             invitation_token_hash = NULL,
             verified_at = $1,
             nominee_user_id = COALESCE($2, nominee_user_id),
             updated_at = $3
         WHERE id = $4`,
        [now, authUser?.id || null, now, nominee.id]
      );
    } catch (err: any) {
      console.warn('[NomineeController:AcceptRDS:Warning]', err.message);
    }

    // Mirror in memory
    const memNominee = memoryDb.nominees.find(n => n.id === nominee.id);
    if (memNominee) {
      memNominee.invitation_status = 'ACCEPTED';
      memNominee.invitation_token_hash = null;
      memNominee.verified_at = now.toISOString();
      if (authUser) memNominee.nominee_user_id = authUser.id;
    }
    saveMemoryDb();

    await AuditService.recordEvent({
      actorId: authUser?.id || null,
      actorEmail: nominee.email,
      actorRole: 'NOMINEE',
      action: 'NOMINEE_INVITATION_ACCEPTED',
      resourceType: 'NOMINEE',
      resourceId: nominee.id,
      outcome: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({
      message: 'Invitation accepted successfully. You are now verified as a nominee.',
      token: issuedJwt,
      user: authUser || null,
      nominee: {
        id: nominee.id,
        fullName: nominee.full_name,
        full_name: nominee.full_name,
        email: nominee.email,
        relationshipType: nominee.relationship_type,
        relationship_type: nominee.relationship_type,
        invitationStatus: 'ACCEPTED',
        invitation_status: 'ACCEPTED',
        nominee_user_id: authUser?.id || nominee.nominee_user_id || null,
        verifiedAt: now.toISOString(),
        verified_at: now.toISOString()
      }
    });
  }

  // ================= SNS STATUS & RESEND =================

  public static async checkSnsConfirmation(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;
    let nominee: any = null;

    try {
      const resNom = await query('SELECT * FROM nominees WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
      if (resNom.rows && resNom.rows.length > 0) nominee = resNom.rows[0];
    } catch {
      nominee = memoryDb.nominees.find(n => n.id === id && n.owner_id === req.user?.id);
    }

    if (!nominee) {
      res.status(404).json({ error: 'Nominee not found.' });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    // If raw token exists or we reconstruct it
    const token = nominee.invitation_token_hash || 'verified';
    const invitationLink = `${frontendUrl}/?tab=accept-invitation&email=${encodeURIComponent(nominee.email)}`;
    const subject = 'VaultKeep nominee invitation';
    const messageBody = `Hi ${nominee.full_name},\n` +
      `${req.user.name} invited you to be a nominee in their VaultKeep digital legacy vault.\n\n` +
      `Accept invitation:\n${invitationLink}\n\n` +
      `This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.\n` +
      `— The VaultKeep Team`;

    const result = await NotificationService.checkAndDeliverPendingInvitation(
      nominee.email,
      req.user.id,
      subject,
      messageBody,
      nominee.id
    );

    res.json(result);
  }

  // ================= NOMINEE PORTAL & RELEASED DOCUMENTS =================

  public static async getNomineeRelationships(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await query(
        `SELECT n.id as nominee_id, n.owner_id, u.name as owner_name, n.relationship_type,
                n.invitation_status, COALESCE(l.current_state, 'ACTIVE') as lifecycle_state,
                (l.current_state = 'ACCESS_GRANTED') as is_release_granted,
                l.grace_period_ends_at
         FROM nominees n
         JOIN users u ON u.id = n.owner_id
         LEFT JOIN account_lifecycle l ON l.owner_id = n.owner_id
         WHERE LOWER(n.email) = LOWER($1) OR n.nominee_user_id = $2`,
        [req.user.email, req.user.id]
      );

      if (result.rows && result.rows.length > 0) {
        const mapped = result.rows.map((rel: any) => ({
          nomineeId: rel.nominee_id,
          ownerId: rel.owner_id,
          ownerName: rel.owner_name,
          relationshipType: rel.relationship_type,
          invitationStatus: rel.invitation_status,
          lifecycleState: rel.lifecycle_state,
          isReleaseGranted: rel.is_release_granted,
          gracePeriodEndsAt: rel.grace_period_ends_at
        }));
        res.json({ relationships: mapped });
        return;
      }
    } catch (err: any) {
      console.warn('[NomineeController:Relationships:Warning]', err.message);
    }

    // Memory fallback
    const relationships = memoryDb.nominees.filter(
      n => n.email.toLowerCase() === req.user?.email.toLowerCase() || n.nominee_user_id === req.user?.id
    );

    const results = relationships.map(rel => {
      const owner = memoryDb.users.find(u => u.id === rel.owner_id);
      const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === rel.owner_id);

      return {
        nomineeId: rel.id,
        ownerId: rel.owner_id,
        ownerName: owner?.name || 'Account Owner',
        relationshipType: rel.relationship_type,
        invitationStatus: rel.invitation_status,
        lifecycleState: lifecycle?.current_state || 'ACTIVE',
        isReleaseGranted: lifecycle?.current_state === 'ACCESS_GRANTED',
        gracePeriodEndsAt: lifecycle?.grace_period_ends_at || null
      };
    });

    res.json({ relationships: results });
  }

  public static async getReleasedDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await query(
        `SELECT g.id as grant_id, d.id as document_id, d.original_name, d.category,
                d.file_size_bytes, d.mime_type, d.encryption_algorithm, d.checksum_sha256,
                u.name as owner_name, g.granted_at, g.expires_at
         FROM release_grants g
         JOIN documents d ON d.id = g.document_id
         JOIN users u ON u.id = g.owner_id
         JOIN account_lifecycle l ON l.owner_id = g.owner_id
         JOIN nominees n ON n.id = g.nominee_id
         WHERE (LOWER(n.email) = LOWER($1) OR n.nominee_user_id = $2)
           AND g.grant_status = 'ACTIVE'
           AND l.current_state = 'ACCESS_GRANTED'
           AND d.upload_status != 'DELETED'`,
        [req.user.email, req.user.id]
      );

      if (result.rows && result.rows.length > 0) {
        const list = result.rows.map((row: any) => ({
          grantId: row.grant_id,
          documentId: row.document_id,
          originalName: row.original_name,
          category: row.category,
          fileSizeBytes: parseInt(row.file_size_bytes || '0', 10),
          mimeType: row.mime_type,
          encryptionAlgorithm: row.encryption_algorithm,
          checksumSha256: row.checksum_sha256,
          ownerName: row.owner_name,
          grantedAt: row.granted_at,
          expiresAt: row.expires_at
        }));
        res.json({ releasedDocuments: list });
        return;
      }
    } catch (err: any) {
      console.warn('[NomineeController:ReleasedDocs:Warning]', err.message);
    }

    // Memory fallback
    const nomineeRecords = memoryDb.nominees.filter(
      n => n.email.toLowerCase() === req.user?.email.toLowerCase() || n.nominee_user_id === req.user?.id
    );

    if (nomineeRecords.length === 0) {
      res.json({ releasedDocuments: [] });
      return;
    }

    const nomineeIds = nomineeRecords.map(n => n.id);
    const grants = memoryDb.release_grants.filter(
      g => nomineeIds.includes(g.nominee_id) && g.grant_status === 'ACTIVE'
    );

    const releasedList: any[] = [];
    for (const grant of grants) {
      const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === grant.owner_id);
      if (!lifecycle || lifecycle.current_state !== 'ACCESS_GRANTED') continue;

      const doc = memoryDb.documents.find(d => d.id === grant.document_id && d.upload_status !== 'DELETED');
      const owner = memoryDb.users.find(u => u.id === grant.owner_id);

      if (doc) {
        releasedList.push({
          grantId: grant.id,
          documentId: doc.id,
          originalName: doc.original_name,
          category: doc.category,
          fileSizeBytes: doc.file_size_bytes,
          mimeType: doc.mime_type,
          encryptionAlgorithm: doc.encryption_algorithm,
          checksumSha256: doc.checksum_sha256,
          ownerName: owner?.name || 'Account Owner',
          grantedAt: grant.granted_at,
          expiresAt: grant.expires_at
        });
      }
    }

    res.json({ releasedDocuments: releasedList });
  }

  public static async downloadReleasedDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params; // documentId
    let doc: any = null;
    let grant: any = null;

    try {
      const grantRes = await query(
        `SELECT g.*, d.*, l.current_state as lifecycle_state
         FROM release_grants g
         JOIN documents d ON d.id = g.document_id
         JOIN account_lifecycle l ON l.owner_id = g.owner_id
         JOIN nominees n ON n.id = g.nominee_id
         WHERE g.document_id = $1
           AND (LOWER(n.email) = LOWER($2) OR n.nominee_user_id = $3)
           AND g.grant_status = 'ACTIVE'
           AND d.upload_status != 'DELETED'`,
        [id, req.user.email, req.user.id]
      );

      if (grantRes.rows && grantRes.rows.length > 0) {
        const row = grantRes.rows[0];
        if (row.lifecycle_state !== 'ACCESS_GRANTED') {
          res.status(403).json({ error: 'Access Denied: Owner account has not reached authorized release state.' });
          return;
        }
        grant = row;
        doc = row;
      }
    } catch (err: any) {
      console.warn('[NomineeController:DownloadGrantQuery:Warning]', err.message);
    }

    if (!doc) {
      // Memory fallback check
      const nomineeRecords = memoryDb.nominees.filter(
        n => n.email.toLowerCase() === req.user?.email.toLowerCase() || n.nominee_user_id === req.user?.id
      );
      const nomineeIds = nomineeRecords.map(n => n.id);
      grant = memoryDb.release_grants.find(
        g => g.document_id === id && nomineeIds.includes(g.nominee_id) && g.grant_status === 'ACTIVE'
      );

      if (!grant) {
        res.status(403).json({ error: 'Access Denied: You do not have an authorized release grant for this document.' });
        return;
      }

      const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === grant.owner_id);
      if (!lifecycle || lifecycle.current_state !== 'ACCESS_GRANTED') {
        res.status(403).json({ error: 'Access Denied: Owner account has not reached authorized release state.' });
        return;
      }

      doc = memoryDb.documents.find(d => d.id === id && d.upload_status !== 'DELETED');
    }

    if (!doc) {
      res.status(404).json({ error: 'Document not found or has been revoked.' });
      return;
    }

    try {
      const ciphertext = await StorageService.getEncryptedObject(doc.storage_key);
      const encryptionContext = {
        ownerId: doc.owner_id,
        documentId: doc.id,
        platform: 'VaultKeep'
      };

      const plaintextBuffer = await EnvelopeEncryptionService.decryptDocument(
        ciphertext,
        doc.encrypted_dek_base64,
        doc.dek_iv_base64,
        doc.auth_tag_base64,
        doc.kms_key_id,
        doc.checksum_sha256,
        encryptionContext
      );

      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: 'NOMINEE',
        action: 'NOMINEE_RELEASED_DOCUMENT_DOWNLOADED',
        resourceType: 'DOCUMENT',
        resourceId: doc.id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          grantId: grant?.id || grant?.grant_id,
          ownerId: doc.owner_id,
          documentName: doc.original_name
        }
      });

      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', plaintextBuffer.length);
      res.send(plaintextBuffer);
    } catch (err: any) {
      await AuditService.recordSecurityEvent(
        'NOMINEE_DECRYPTION_FAILURE',
        req.user.email,
        { documentId: id, error: err.message },
        req.ip,
        req.headers['user-agent']
      );
      res.status(500).json({ error: `Decryption failed: ${err.message}` });
    }
  }

  public static async getNomineeAccessHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await query(
        `SELECT * FROM audit_logs
         WHERE actor_id = $1 OR LOWER(actor_email) = LOWER($2)
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.user.id, req.user.email]
      );
      if (result.rows) {
        res.json({ accessHistory: result.rows });
        return;
      }
    } catch {
      // Fallback
    }

    const history = memoryDb.audit_logs.filter(
      l => l.actor_id === req.user?.id || (l.actor_email && l.actor_email.toLowerCase() === req.user?.email.toLowerCase())
    );

    res.json({ accessHistory: history });
  }
}
