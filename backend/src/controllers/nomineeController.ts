import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { query } from '../db';
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
      // 1. Reconcile status in RDS if nominee previously registered an account
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

      // 2. Query nominees from Amazon RDS PostgreSQL
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
    } catch (err: any) {
      console.error('[NomineeController:GetNominees:Error]', err.message);
      res.status(500).json({ error: `Database error fetching nominees: ${err.message}` });
    }
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
    try {
      const existing = await query('SELECT id FROM nominees WHERE owner_id = $1 AND LOWER(email) = LOWER($2)', [req.user.id, normalizedEmail]);
      if (existing.rows && existing.rows.length > 0) {
        res.status(409).json({ error: `A nominee with email '${normalizedEmail}' has already been added to your vault.` });
        return;
      }
    } catch (err: any) {
      console.error('[NomineeController:DuplicateCheck:Error]', err.message);
      res.status(500).json({ error: `Database error checking duplicate nominee: ${err.message}` });
      return;
    }

    // 4. Generate secure 32-byte cryptographic invitation token
    const rawInvitationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');

    // 5. Expiration: 7 days
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 6. Check if nominee already has an account in RDS
    let linkedUserId: string | null = null;
    let invitationStatus = 'PENDING';
    let verifiedAt: Date | null = null;

    try {
      const userRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
      if (userRes.rows && userRes.rows.length > 0) {
        linkedUserId = userRes.rows[0].id;
      }
    } catch (err: any) {
      console.warn('[NomineeController:UserCheck:Warning]', err.message);
    }

    const nomineeId = uuidv4();

    // 7. Persist to PostgreSQL database directly
    try {
      await query(
        `INSERT INTO nominees (
          id, owner_id, nominee_user_id, full_name, email, phone,
          relationship_type, invitation_token_hash, invitation_status,
          invitation_expires_at, verified_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
      res.status(500).json({ error: `Failed to persist nominee to database: ${err.message}` });
      return;
    }

    const newNominee = {
      id: nomineeId,
      owner_id: req.user.id,
      nominee_user_id: linkedUserId,
      full_name: fullName.trim(),
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : null,
      relationship_type: relationshipType,
      relationshipType,
      invitation_token_hash: tokenHash,
      invitation_status: invitationStatus,
      invitationStatus,
      invitation_expires_at: expiresAt.toISOString(),
      invitationExpiresAt: expiresAt.toISOString(),
      verified_at: verifiedAt ? (verifiedAt as Date).toISOString() : null,
      verifiedAt: verifiedAt ? (verifiedAt as Date).toISOString() : null,
      created_at: now.toISOString(),
      createdAt: now.toISOString(),
      updated_at: now.toISOString()
    };

    // 8. Build accept invitation link for email
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const invitationLink = `${frontendUrl}/?tab=accept-invitation&token=${rawInvitationToken}&email=${encodeURIComponent(normalizedEmail)}`;

    const subject = 'VaultKeep nominee invitation';
    const messageBody = `Hi ${fullName.trim()},\n` +
      `${req.user.name} invited you to be a nominee in their VaultKeep digital legacy vault.\n\n` +
      `Accept invitation:\n${invitationLink}\n\n` +
      `This invitation expires in 7 days. If you weren’t expecting it, you can ignore this email.\n` +
      `— The VaultKeep Team`;

    // 9. Send invitation notification via AWS SNS
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

    try {
      await query(`DELETE FROM nominees WHERE id = $1 AND owner_id = $2`, [id, req.user.id]);
      await query(`DELETE FROM document_release_rules WHERE nominee_id = $1`, [id]);
      await query(`DELETE FROM release_grants WHERE nominee_id = $1`, [id]);

      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'NOMINEE_RELATIONSHIP_REVOKED',
        resourceType: 'NOMINEE',
        resourceId: id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({ message: 'Nominee relationship and all associated release rules revoked.' });
    } catch (err: any) {
      console.error('[NomineeController:Delete:Error]', err.message);
      res.status(500).json({ error: `Database error revoking nominee relationship: ${err.message}` });
    }
  }

  // ================= INVITATION WORKFLOW =================

  public static async verifyInvitationToken(req: Request, res: Response): Promise<void> {
    const token = (req.query.token as string || req.body?.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'Invitation token is required.' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
      const resNom = await query(
        `SELECT n.*, u.name as owner_name, u.email as owner_email
         FROM nominees n
         JOIN users u ON u.id = n.owner_id
         WHERE n.invitation_token_hash = $1`,
        [tokenHash]
      );

      if (!resNom.rows || resNom.rows.length === 0) {
        res.status(404).json({ error: 'Invalid or already accepted invitation token.' });
        return;
      }

      const nominee = resNom.rows[0];

      if (new Date() > new Date(nominee.invitation_expires_at)) {
        res.status(410).json({ error: 'This invitation token has expired.' });
        return;
      }

      res.json({
        valid: true,
        nomineeEmail: nominee.email,
        nomineeName: nominee.full_name,
        relationshipType: nominee.relationship_type,
        ownerName: nominee.owner_name || 'Account Owner',
        ownerEmail: nominee.owner_email,
        expiresAt: nominee.invitation_expires_at
      });
    } catch (err: any) {
      console.error('[NomineeController:VerifyToken:Error]', err.message);
      res.status(500).json({ error: `Database error verifying token: ${err.message}` });
    }
  }

  public static async acceptInvitation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { token, password, name } = req.body;
    if (!token) {
      res.status(400).json({ error: 'Invitation token is required.' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    try {
      const resNom = await query('SELECT * FROM nominees WHERE invitation_token_hash = $1', [tokenHash]);
      if (!resNom.rows || resNom.rows.length === 0) {
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

      const nominee = resNom.rows[0];

      if (new Date() > new Date(nominee.invitation_expires_at)) {
        res.status(410).json({ error: 'This invitation token has expired.' });
        return;
      }

      let authUser = req.user;
      let issuedJwt: string | undefined;
      const normalizedEmail = nominee.email.toLowerCase();
      const now = new Date();

      if (!authUser) {
        const uRes = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
        const existingUser = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;

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
          // Optional password provided: register new nominee portal account directly in PostgreSQL
          const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
          const password_hash = await bcrypt.hash(password, saltRounds);
          const userId = uuidv4();
          const userName = (name || nominee.full_name || 'Nominee').trim();

          await query(
            `INSERT INTO users (id, name, email, password_hash, role, account_status, contact_verified, last_check_in_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'NOMINEE', 'ACTIVE', true, $5, $6, $7)`,
            [userId, userName, normalizedEmail, password_hash, now, now, now]
          );

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

      // Update nominee in PostgreSQL
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
    } catch (err: any) {
      console.error('[NomineeController:Accept:Error]', err.message);
      res.status(500).json({ error: `Database error accepting invitation: ${err.message}` });
    }
  }

  // ================= SNS STATUS & RESEND =================

  public static async checkSnsConfirmation(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;

    try {
      const resNom = await query('SELECT * FROM nominees WHERE id = $1 AND owner_id = $2', [id, req.user.id]);
      if (!resNom.rows || resNom.rows.length === 0) {
        res.status(404).json({ error: 'Nominee not found.' });
        return;
      }
      const nominee = resNom.rows[0];

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
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
    } catch (err: any) {
      console.error('[NomineeController:CheckSNS:Error]', err.message);
      res.status(500).json({ error: `Error checking SNS status: ${err.message}` });
    }
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
    } catch (err: any) {
      console.error('[NomineeController:Relationships:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving nominee relationships: ${err.message}` });
    }
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
    } catch (err: any) {
      console.error('[NomineeController:ReleasedDocs:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving released documents: ${err.message}` });
    }
  }

  public static async downloadReleasedDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params; // documentId

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

      if (!grantRes.rows || grantRes.rows.length === 0) {
        res.status(403).json({ error: 'Access Denied: You do not have an active release grant for this document.' });
        return;
      }

      const row = grantRes.rows[0];
      if (row.lifecycle_state !== 'ACCESS_GRANTED') {
        res.status(403).json({ error: 'Access Denied: Owner account has not reached authorized release state.' });
        return;
      }

      const doc = row;
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
          grantId: row.id,
          ownerId: doc.owner_id,
          documentName: doc.original_name
        }
      });

      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', plaintextBuffer.length);
      res.send(plaintextBuffer);
    } catch (err: any) {
      console.error('[NomineeController:Download:Error]', err.message);
      await AuditService.recordSecurityEvent(
        'NOMINEE_DECRYPTION_FAILURE',
        req.user.email,
        { documentId: id, error: err.message },
        req.ip,
        req.headers['user-agent']
      );
      res.status(500).json({ error: `Decryption or document download failed: ${err.message}` });
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
      res.json({ accessHistory: result.rows || [] });
    } catch (err: any) {
      console.error('[NomineeController:AccessHistory:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving access history: ${err.message}` });
    }
  }
}
