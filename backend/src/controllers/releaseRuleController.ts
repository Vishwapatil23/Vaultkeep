import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { query } from '../db';
import { AuditService } from '../services/auditService';

export class ReleaseRuleController {
  public static async getRules(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await query(
        `SELECT r.id, r.document_id, d.original_name as document_name, d.category as document_category,
                r.nominee_id, n.full_name as nominee_name, n.email as nominee_email,
                r.rule_status, r.access_duration_days, r.confirmed_at, r.created_at
         FROM document_release_rules r
         JOIN documents d ON d.id = r.document_id
         JOIN nominees n ON n.id = r.nominee_id
         WHERE r.owner_id = $1
         ORDER BY r.created_at DESC`,
        [req.user.id]
      );

      const enriched = result.rows.map((row: any) => ({
        id: row.id,
        documentId: row.document_id,
        documentName: row.document_name,
        documentCategory: row.document_category,
        nomineeId: row.nominee_id,
        nomineeName: row.nominee_name,
        nomineeEmail: row.nominee_email,
        ruleStatus: row.rule_status,
        accessDurationDays: row.access_duration_days,
        confirmedAt: row.confirmed_at,
        createdAt: row.created_at
      }));

      res.json({ releaseRules: enriched });
    } catch (err: any) {
      console.error('[ReleaseRuleController:Get:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving release rules: ${err.message}` });
    }
  }

  public static async createRule(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { documentId, nomineeId, accessDurationDays } = req.body;

    if (!documentId || !nomineeId) {
      res.status(400).json({ error: 'documentId and nomineeId are required.' });
      return;
    }

    try {
      // 1. Verify document belongs to owner in PostgreSQL
      const dRes = await query('SELECT id, original_name FROM documents WHERE id = $1 AND owner_id = $2', [documentId, req.user.id]);
      if (!dRes.rows || dRes.rows.length === 0) {
        res.status(404).json({ error: 'Document not found or does not belong to your vault.' });
        return;
      }
      const doc = dRes.rows[0];

      // 2. Verify nominee belongs to owner in PostgreSQL
      const nRes = await query('SELECT id, full_name, email FROM nominees WHERE id = $1 AND owner_id = $2', [nomineeId, req.user.id]);
      if (!nRes.rows || nRes.rows.length === 0) {
        res.status(404).json({ error: 'Nominee not found or does not belong to your vault.' });
        return;
      }
      const nominee = nRes.rows[0];

      const ruleId = uuidv4();
      const now = new Date();

      // 3. Upsert rule directly in PostgreSQL
      await query(
        `INSERT INTO document_release_rules (id, owner_id, document_id, nominee_id, rule_status, access_duration_days, confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8)
         ON CONFLICT (document_id, nominee_id)
         DO UPDATE SET rule_status = 'ACTIVE', access_duration_days = EXCLUDED.access_duration_days, confirmed_at = $9, updated_at = $10`,
        [ruleId, req.user.id, documentId, nomineeId, accessDurationDays || null, now, now, now, now, now]
      );

      const rule = {
        id: ruleId,
        owner_id: req.user.id,
        document_id: documentId,
        nominee_id: nomineeId,
        rule_status: 'ACTIVE',
        access_duration_days: accessDurationDays || null,
        confirmed_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      };

      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'RELEASE_RULE_CONFIGURED',
        resourceType: 'RELEASE_RULE',
        resourceId: rule.id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: {
          documentId,
          nomineeId,
          nomineeName: nominee.full_name,
          documentName: doc.original_name,
          accessDurationDays
        }
      });

      res.status(201).json({
        message: 'Document release rule confirmed successfully.',
        rule
      });
    } catch (err: any) {
      console.error('[ReleaseRuleController:Create:Error]', err.message);
      res.status(500).json({ error: `Database error configuring release rule: ${err.message}` });
    }
  }

  public static async deleteRule(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;

    try {
      await query(`DELETE FROM document_release_rules WHERE id = $1 AND owner_id = $2`, [id, req.user.id]);

      await AuditService.recordEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: req.user.role,
        action: 'RELEASE_RULE_REVOKED',
        resourceType: 'RELEASE_RULE',
        resourceId: id,
        outcome: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.json({ message: 'Release rule revoked.' });
    } catch (err: any) {
      console.error('[ReleaseRuleController:Delete:Error]', err.message);
      res.status(500).json({ error: `Database error revoking release rule: ${err.message}` });
    }
  }
}
