import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { memoryDb, saveMemoryDb } from '../db';
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

    const nominees = memoryDb.nominees.filter(n => n.owner_id === req.user?.id);
    const enriched = nominees.map(n => {
      // Reconcile status: if nominee registered an account or verified, update to ACCEPTED
      if (n.invitation_status === 'PENDING') {
        const matchingUser = memoryDb.users.find(u => u.email.toLowerCase() === n.email.toLowerCase());
        if (matchingUser || n.verified_at) {
          n.invitation_status = 'ACCEPTED';
          if (matchingUser && !n.nominee_user_id) {
            n.nominee_user_id = matchingUser.id;
          }
          if (!n.verified_at) {
            n.verified_at = new Date().toISOString();
          }
          saveMemoryDb();
        }
      }

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
        createdAt: n.created_at
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

    // 3. Prevent duplicate nominees for the same owner
    const existing = memoryDb.nominees.find(
      n => n.owner_id === req.user?.id && n.email.toLowerCase() === normalizedEmail
    );

    if (existing) {
      res.status(409).json({ error: `A nominee with email '${normalizedEmail}' has already been added to your vault.` });
      return;
    }

    // Generate high-entropy 256-bit invitation token
    const rawInvitationToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const nomineeId = uuidv4();
    const linkedUser = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);

    const newNominee = {
      id: nomineeId,
      owner_id: req.user.id,
      nominee_user_id: linkedUser ? linkedUser.id : null,
      full_name: fullName.trim(),
      email: normalizedEmail,
      phone: phone ? phone.trim() : null,
      relationship_type: relationshipType,
      invitation_token_hash: tokenHash,
      invitation_status: linkedUser ? 'ACCEPTED' : 'PENDING',
      invitation_expires_at: expiresAt,
      verified_at: linkedUser ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
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

    if (notifResult.deliveryStatus === 'FAILED') {
      // Roll back newly created nominee so owner can retry
      const idx = memoryDb.nominees.findIndex(n => n.id === nomineeId);
      if (idx !== -1) memoryDb.nominees.splice(idx, 1);

      console.error(`[NomineeController:ERROR] Invitation delivery failed for ${normalizedEmail}: ${notifResult.error}`);
      res.status(502).json({
        error: `Failed to dispatch invitation email via AWS SNS: ${notifResult.error || 'Provider rejected request'}`
      });
      return;
    }

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
      metadata: { nomineeEmail: normalizedEmail, relationshipType, providerMessageId: notifResult.providerMessageId }
    });

    res.status(201).json({
      message: 'Nominee invited successfully. Invitation email dispatched via AWS SNS.',
      nominee: newNominee,
      invitationToken: rawInvitationToken,
      invitationLink
    });
  }

  public static async deleteNominee(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;
    const nomineeIndex = memoryDb.nominees.findIndex(n => n.id === id && n.owner_id === req.user?.id);
    if (nomineeIndex === -1) {
      res.status(404).json({ error: 'Nominee not found.' });
      return;
    }

    const nominee = memoryDb.nominees[nomineeIndex];
    memoryDb.nominees.splice(nomineeIndex, 1);

    // Revoke release rules and active grants
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
    const nominee = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);

    if (!nominee) {
      res.status(404).json({ error: 'Invalid or already accepted invitation token.' });
      return;
    }

    if (new Date() > new Date(nominee.invitation_expires_at)) {
      res.status(410).json({ error: 'This invitation token has expired.' });
      return;
    }

    const owner = memoryDb.users.find(u => u.id === nominee.owner_id);

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
    const nominee = memoryDb.nominees.find(n => n.invitation_token_hash === tokenHash);

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

    // If nominee user is not currently logged in, check if password was provided to create/login account
    if (!authUser) {
      const normalizedEmail = nominee.email.toLowerCase();
      let existingUser = memoryDb.users.find(u => u.email.toLowerCase() === normalizedEmail);

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
      } else if (password) {
        // Register brand-new Nominee user account
        if (password.length < 8) {
          res.status(400).json({ error: 'Password must be at least 8 characters long.' });
          return;
        }

        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
        const password_hash = await bcrypt.hash(password, saltRounds);
        const userId = uuidv4();
        const userName = (name || nominee.full_name || 'Nominee').trim();

        const newUser = {
          id: userId,
          name: userName,
          email: normalizedEmail,
          password_hash,
          role: 'NOMINEE' as const,
          account_status: 'ACTIVE',
          contact_verified: true,
          last_check_in_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        memoryDb.users.push(newUser);
        authUser = {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          name: newUser.name
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

    nominee.invitation_status = 'ACCEPTED';
    nominee.invitation_token_hash = null;
    nominee.verified_at = new Date().toISOString();
    if (authUser) {
      nominee.nominee_user_id = authUser.id;
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
      nominee
    });
  }

  // ================= NOMINEE PORTAL & RELEASED DOCUMENTS =================

  public static async getNomineeRelationships(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

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

    // Find all nominee relationships for this user
    const nomineeRecords = memoryDb.nominees.filter(
      n => n.email.toLowerCase() === req.user?.email.toLowerCase() || n.nominee_user_id === req.user?.id
    );

    if (nomineeRecords.length === 0) {
      res.json({ releasedDocuments: [] });
      return;
    }

    const nomineeIds = nomineeRecords.map(n => n.id);

    // Find all active release grants for these nominee IDs
    const grants = memoryDb.release_grants.filter(
      g => nomineeIds.includes(g.nominee_id) && g.grant_status === 'ACTIVE'
    );

    const releasedList: any[] = [];

    for (const grant of grants) {
      // Verify owner lifecycle is strictly ACCESS_GRANTED
      const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === grant.owner_id);
      if (!lifecycle || lifecycle.current_state !== 'ACCESS_GRANTED') {
        continue; // Do NOT reveal documents if owner is ACTIVE or in GRACE_PERIOD!
      }

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

    // 1. Resource Authorization: Check if nominee has an authorized active grant
    const nomineeRecords = memoryDb.nominees.filter(
      n => n.email.toLowerCase() === req.user?.email.toLowerCase() || n.nominee_user_id === req.user?.id
    );
    const nomineeIds = nomineeRecords.map(n => n.id);

    const grant = memoryDb.release_grants.find(
      g => g.document_id === id && nomineeIds.includes(g.nominee_id) && g.grant_status === 'ACTIVE'
    );

    if (!grant) {
      await AuditService.recordSecurityEvent(
        'UNAUTHORIZED_NOMINEE_DOCUMENT_ACCESS',
        req.user.email,
        { documentId: id, reason: 'No release grant found' },
        req.ip,
        req.headers['user-agent']
      );
      res.status(403).json({ error: 'Access Denied: You do not have an authorized release grant for this document.' });
      return;
    }

    // 2. Lifecycle Check: Ensure owner state is currently ACCESS_GRANTED
    const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === grant.owner_id);
    if (!lifecycle || lifecycle.current_state !== 'ACCESS_GRANTED') {
      await AuditService.recordSecurityEvent(
        'PREMATURE_NOMINEE_DOCUMENT_ACCESS',
        req.user.email,
        { documentId: id, currentState: lifecycle?.current_state },
        req.ip,
        req.headers['user-agent']
      );
      res.status(403).json({ error: 'Access Denied: Owner account has not reached authorized release state.' });
      return;
    }

    // 3. Document retrieval and Decryption
    const doc = memoryDb.documents.find(d => d.id === id && d.upload_status !== 'DELETED');
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

      // 4. Audit Log
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
          grantId: grant.id,
          ownerId: grant.owner_id,
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

    const history = memoryDb.audit_logs.filter(
      l => l.actor_id === req.user?.id || (l.actor_email && l.actor_email.toLowerCase() === req.user?.email.toLowerCase())
    );

    res.json({ accessHistory: history });
  }
}
