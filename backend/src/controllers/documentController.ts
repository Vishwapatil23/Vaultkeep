import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { query } from '../db';
import { EnvelopeEncryptionService } from '../crypto/envelopeEncryption';
import { StorageService } from '../services/storageService';
import { AuditService } from '../services/auditService';

const KMS_KEY_ID = process.env.KMS_KEY_ID || 'alias/vaultkeep-master-key';

export class DocumentController {
  public static async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No document file provided.' });
      return;
    }

    const { category = 'PERSONAL' } = req.body;
    const documentId = uuidv4();
    const storageKey = `vault/${req.user.id}/${documentId}.enc`;
    const docCategory = ['FINANCIAL', 'LEGAL', 'PERSONAL', 'CREDENTIALS', 'OTHER'].includes(category) ? category : 'PERSONAL';

    try {
      // 1. Envelope Encrypt before persistence (AES-256-GCM + AWS KMS DEK)
      const encryptionContext = {
        ownerId: req.user.id,
        documentId: documentId,
        platform: 'VaultKeep'
      };

      const encryptedPayload = await EnvelopeEncryptionService.encryptDocument(
        file.buffer,
        KMS_KEY_ID,
        encryptionContext
      );

      // 2. Persist ONLY ciphertext to private S3 bucket
      await StorageService.putEncryptedObject(storageKey, encryptedPayload.ciphertext, 'application/octet-stream');

      const now = new Date();

      // 3. Persist metadata and KMS-wrapped DEK in Amazon RDS PostgreSQL
      try {
        await query(
          `INSERT INTO documents (
            id, owner_id, original_name, storage_key, mime_type, file_size_bytes, category,
            upload_status, encryption_algorithm, encryption_version, kms_key_id,
            encrypted_dek_base64, dek_iv_base64, auth_tag_base64, checksum_sha256,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'UPLOADED', $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            documentId,
            req.user.id,
            file.originalname,
            storageKey,
            file.mimetype,
            file.size,
            docCategory,
            encryptedPayload.algorithm,
            encryptedPayload.version,
            KMS_KEY_ID,
            encryptedPayload.encryptedDekBase64,
            encryptedPayload.ivBase64,
            encryptedPayload.authTagBase64,
            encryptedPayload.checksumSha256,
            now,
            now
          ]
        );
      } catch (err: any) {
        console.error('[DocumentController:Upload:DBError]', err.message);
        // Rollback S3 upload if RDS persistence fails to prevent orphaned blobs
        try {
          await StorageService.deleteEncryptedObject(storageKey);
        } catch {}
        res.status(500).json({ error: `Database error saving document metadata: ${err.message}` });
        return;
      }

      // 4. Audit Log
      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'DOCUMENT_ENCRYPTED_AND_UPLOADED',
        resourceType: 'DOCUMENT',
        resourceId: documentId,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          originalName: file.originalname,
          size: file.size,
          category: docCategory,
          algorithm: encryptedPayload.algorithm,
          sha256: encryptedPayload.checksumSha256
        }
      });

      res.status(201).json({
        message: 'Document encrypted and stored securely in vault and Amazon RDS.',
        document: {
          id: documentId,
          originalName: file.originalname,
          category: docCategory,
          fileSizeBytes: file.size,
          mimeType: file.mimetype,
          encryptionAlgorithm: encryptedPayload.algorithm,
          checksumSha256: encryptedPayload.checksumSha256,
          createdAt: now.toISOString()
        }
      });
    } catch (err: any) {
      console.error('[DocumentController:Upload:Error]', err.message);
      await AuditService.recordSecurityEvent(
        'DOCUMENT_UPLOAD_FAILED',
        req.user.email,
        { error: err.message },
        req.ip,
        req.headers['user-agent']
      );
      res.status(500).json({ error: `Document encryption or storage failed: ${err.message}` });
    }
  }

  public static async getDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await query(
        `SELECT d.id, d.original_name, d.category, d.file_size_bytes, d.mime_type,
                d.encryption_algorithm, d.encryption_version, d.checksum_sha256, d.upload_status, d.storage_key, d.created_at,
                (SELECT COUNT(*)::int FROM document_release_rules r WHERE r.document_id = d.id AND r.rule_status = 'ACTIVE') as assigned_nominees_count
         FROM documents d
         WHERE d.owner_id = $1 AND d.upload_status != 'DELETED'
         ORDER BY d.created_at DESC`,
        [req.user.id]
      );

      const responseList = result.rows.map((d: any) => ({
        id: d.id,
        originalName: d.original_name,
        category: d.category,
        fileSizeBytes: parseInt(d.file_size_bytes || '0', 10),
        mimeType: d.mime_type,
        encryptionAlgorithm: d.encryption_algorithm,
        encryptionVersion: d.encryption_version,
        checksumSha256: d.checksum_sha256,
        uploadStatus: d.upload_status,
        storageKey: d.storage_key,
        s3Location: `s3://${process.env.S3_BUCKET_NAME || 'vaultkeep-documents-327973843616-us-east-1'}/${d.storage_key}`,
        assignedNomineesCount: d.assigned_nominees_count || 0,
        createdAt: d.created_at
      }));

      res.json({ documents: responseList });
    } catch (err: any) {
      console.error('[DocumentController:Get:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving documents: ${err.message}` });
    }
  }

  public static async downloadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;

    try {
      const resDoc = await query(
        `SELECT * FROM documents WHERE id = $1 AND owner_id = $2 AND upload_status != 'DELETED'`,
        [id, req.user.id]
      );

      if (!resDoc.rows || resDoc.rows.length === 0) {
        res.status(404).json({ error: 'Document not found or unauthorized.' });
        return;
      }

      const doc = resDoc.rows[0];

      // 1. Fetch ciphertext from S3
      const ciphertext = await StorageService.getEncryptedObject(doc.storage_key);

      // 2. Decrypt DEK via KMS and decrypt ciphertext via AES-256-GCM
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

      // 3. Record Audit
      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'DOCUMENT_DECRYPTED_AND_DOWNLOADED',
        resourceType: 'DOCUMENT',
        resourceId: doc.id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // 4. Send decrypted document stream
      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', plaintextBuffer.length);
      res.send(plaintextBuffer);
    } catch (err: any) {
      console.error('[DocumentController:Download:Error]', err.message);
      await AuditService.recordSecurityEvent(
        'DOCUMENT_DECRYPTION_FAILED',
        req.user.email,
        { documentId: id, error: err.message },
        req.ip,
        req.headers['user-agent']
      );
      res.status(500).json({ error: `Decryption or document download failed: ${err.message}` });
    }
  }

  public static async deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;

    try {
      const resDoc = await query(`SELECT * FROM documents WHERE id = $1 AND owner_id = $2`, [id, req.user.id]);
      if (!resDoc.rows || resDoc.rows.length === 0) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      const doc = resDoc.rows[0];

      // Delete from S3 storage
      try {
        await StorageService.deleteEncryptedObject(doc.storage_key);
      } catch (err: any) {
        console.warn('[DocumentController:DeleteS3:Warning]', err.message);
      }

      // Update in RDS
      await query(`UPDATE documents SET upload_status = 'DELETED', updated_at = NOW() WHERE id = $1 AND owner_id = $2`, [id, req.user.id]);
      await query(`DELETE FROM document_release_rules WHERE document_id = $1`, [id]);
      await query(`DELETE FROM release_grants WHERE document_id = $1`, [id]);

      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'DOCUMENT_DELETED',
        resourceType: 'DOCUMENT',
        resourceId: id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({ message: 'Document and associated release policies deleted safely.' });
    } catch (err: any) {
      console.error('[DocumentController:Delete:Error]', err.message);
      res.status(500).json({ error: `Database error deleting document: ${err.message}` });
    }
  }
}
