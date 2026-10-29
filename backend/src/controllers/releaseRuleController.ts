import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { query, memoryDb, saveMemoryDb } from '../db';
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

      if (result.rows && result.rows.length > 0) {
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
        return;
      }
    } catch (err: any) {
      console.warn('[ReleaseRuleController:Get:Warning]', err.message);
    }

    // Memory fallback
    const rules = memoryDb.document_release_rules.filter(r => r.owner_id === req.user?.id);
    const enriched = rules.map(rule => {
      const doc = memoryDb.documents.find(d => d.id === rule.document_id);
      const nominee = memoryDb.nominees.find(n => n.id === rule.nominee_id);
      return {
        id: rule.id,
        documentId: rule.document_id,
        documentName: doc?.original_name || 'Unknown Document',
        documentCategory: doc?.category || 'OTHER',
        nomineeId: rule.nominee_id,
        nomineeName: nominee?.full_name || 'Unknown Nominee',
        nomineeEmail: nominee?.email || '',
        ruleStatus: rule.rule_status,
        accessDurationDays: rule.access_duration_days,
        confirmedAt: rule.confirmed_at,
        createdAt: rule.created_at
      };
    });

    res.json({ releaseRules: enriched });
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

    // Verify document belongs to owner in RDS
    let doc: any = null;
    try {
      const dRes = await query('SELECT id, original_name FROM documents WHERE id = $1 AND owner_id = $2', [documentId, req.user.id]);
      if (dRes.rows && dRes.rows.length > 0) doc = dRes.rows[0];
    } catch {
      doc = memoryDb.documents.find(d => d.id === documentId && d.owner_id === req.user?.id);
    }
    if (!doc) doc = memoryDb.documents.find(d => d.id === documentId && d.owner_id === req.user?.id);

    if (!doc) {
      res.status(404).json({ error: 'Document not found or does not belong to you.' });
      return;
    }

    // Verify nominee belongs to owner in RDS
    let nominee: any = null;
    try {
      const nRes = await query('SELECT id, full_name, email FROM nominees WHERE id = $1 AND owner_id = $2', [nomineeId, req.user.id]);
      if (nRes.rows && nRes.rows.length > 0) nominee = nRes.rows[0];
    } catch {
      nominee = memoryDb.nominees.find(n => n.id === nomineeId && n.owner_id === req.user?.id);
    }
    if (!nominee) nominee = memoryDb.nominees.find(n => n.id === nomineeId && n.owner_id === req.user?.id);

    if (!nominee) {
      res.status(404).json({ error: 'Nominee not found or does not belong to your vault.' });
      return;
    }

    const ruleId = uuidv4();
    const now = new Date();

    // Persist or update rule in RDS
    try {
      await query(
        `INSERT INTO document_release_rules (id, owner_id, document_id, nominee_id, rule_status, access_duration_days, confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8)
         ON CONFLICT (document_id, nominee_id)
         DO UPDATE SET rule_status = 'ACTIVE', access_duration_days = EXCLUDED.access_duration_days, confirmed_at = $9, updated_at = $10`,
        [ruleId, req.user.id, documentId, nomineeId, accessDurationDays || null, now, now, now, now, now]
      );
    } catch (err: any) {
      console.warn('[ReleaseRuleController:Create:DBError]', err.message);
    }

    // Memory mirror
    let rule = memoryDb.document_release_rules.find(
      r => r.document_id === documentId && r.nominee_id === nomineeId
    );

    if (rule) {
      rule.rule_status = 'ACTIVE';
      rule.access_duration_days = accessDurationDays || null;
      rule.confirmed_at = now.toISOString();
      rule.updated_at = now.toISOString();
    } else {
      rule = {
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
      memoryDb.document_release_rules.push(rule);
    }
    saveMemoryDb();

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
  }

  public static async deleteRule(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { id } = req.params;

    try {
      await query(`DELETE FROM document_release_rules WHERE id = $1 AND owner_id = $2`, [id, req.user.id]);
    } catch (err: any) {
      console.warn('[ReleaseRuleController:Delete:DBError]', err.message);
    }

    const ruleIndex = memoryDb.document_release_rules.findIndex(
      r => r.id === id && r.owner_id === req.user?.id
    );

    if (ruleIndex !== -1) {
      memoryDb.document_release_rules.splice(ruleIndex, 1);
      saveMemoryDb();
    }

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
  }
}
