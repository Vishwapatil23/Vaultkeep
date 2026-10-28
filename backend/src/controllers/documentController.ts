import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { memoryDb } from '../db';
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

      // 3. Persist metadata and KMS-wrapped DEK (NO plaintext DEK, NO plaintext document)
      const newDocument = {
        id: documentId,
        owner_id: req.user.id,
        original_name: file.originalname,
        storage_key: storageKey,
        mime_type: file.mimetype,
        file_size_bytes: file.size,
        category: ['FINANCIAL', 'LEGAL', 'PERSONAL', 'CREDENTIALS', 'OTHER'].includes(category) ? category : 'PERSONAL',
        upload_status: 'UPLOADED',
        encryption_algorithm: encryptedPayload.algorithm,
        encryption_version: encryptedPayload.version,
        kms_key_id: KMS_KEY_ID,
        encrypted_dek_base64: encryptedPayload.encryptedDekBase64,
        dek_iv_base64: encryptedPayload.ivBase64,
        auth_tag_base64: encryptedPayload.authTagBase64,
        checksum_sha256: encryptedPayload.checksumSha256,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      memoryDb.documents.unshift(newDocument);

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
          category,
          algorithm: encryptedPayload.algorithm,
          sha256: encryptedPayload.checksumSha256
        }
      });

      res.status(201).json({
        message: 'Document encrypted and stored securely in vault.',
        document: {
          id: newDocument.id,
          originalName: newDocument.original_name,
          category: newDocument.category,
          fileSizeBytes: newDocument.file_size_bytes,
          mimeType: newDocument.mime_type,
          encryptionAlgorithm: newDocument.encryption_algorithm,
          checksumSha256: newDocument.checksum_sha256,
          createdAt: newDocument.created_at
        }
      });
    } catch (err: any) {
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

    const docs = memoryDb.documents.filter(d => d.owner_id === req.user?.id && d.upload_status !== 'DELETED');
    const responseList = docs.map(d => {
      const rules = memoryDb.document_release_rules.filter(r => r.document_id === d.id && r.rule_status === 'ACTIVE');
      return {
        id: d.id,
        originalName: d.original_name,
        category: d.category,
        fileSizeBytes: d.file_size_bytes,
        mimeType: d.mime_type,
        encryptionAlgorithm: d.encryption_algorithm,
        encryptionVersion: d.encryption_version,
        checksumSha256: d.checksum_sha256,
        uploadStatus: d.upload_status,
        assignedNomineesCount: rules.length,
        createdAt: d.created_at
      };
    });

    res.json({ documents: responseList });
  }

  public static async downloadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;
    const doc = memoryDb.documents.find(d => d.id === id && d.owner_id === req.user?.id && d.upload_status !== 'DELETED');

    if (!doc) {
      res.status(404).json({ error: 'Document not found or unauthorized.' });
      return;
    }

    try {
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
      await AuditService.recordSecurityEvent(
        'DOCUMENT_DECRYPTION_FAILED',
        req.user.email,
        { documentId: id, error: err.message },
        req.ip,
        req.headers['user-agent']
      );
      res.status(500).json({ error: `Decryption failed: ${err.message}` });
    }
  }

  public static async deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;
    const doc = memoryDb.documents.find(d => d.id === id && d.owner_id === req.user?.id);

    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    // Delete from S3 storage
    await StorageService.deleteEncryptedObject(doc.storage_key);
    doc.upload_status = 'DELETED';

    // Revoke any release rules for this document
    memoryDb.document_release_rules = memoryDb.document_release_rules.filter(r => r.document_id !== id);

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
  }
}
