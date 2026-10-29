import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth';
import { memoryDb, saveMemoryDb } from '../db';
import { AuditService } from '../services/auditService';

export class ReleaseRuleController {
  public static async getRules(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

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

    // Verify document belongs to owner
    const doc = memoryDb.documents.find(d => d.id === documentId && d.owner_id === req.user?.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found or does not belong to you.' });
      return;
    }

    // Verify nominee belongs to owner
    const nominee = memoryDb.nominees.find(n => n.id === nomineeId && n.owner_id === req.user?.id);
    if (!nominee) {
      res.status(404).json({ error: 'Nominee not found or does not belong to your vault.' });
      return;
    }

    // Check if rule already exists (update or create)
    let rule = memoryDb.document_release_rules.find(
      r => r.document_id === documentId && r.nominee_id === nomineeId
    );

    const now = new Date().toISOString();

    if (rule) {
      rule.rule_status = 'ACTIVE';
      rule.access_duration_days = accessDurationDays || null;
      rule.confirmed_at = now;
      rule.updated_at = now;
    } else {
      rule = {
        id: uuidv4(),
        owner_id: req.user.id,
        document_id: documentId,
        nominee_id: nomineeId,
        rule_status: 'ACTIVE',
        access_duration_days: accessDurationDays || null,
        confirmed_at: now,
        created_at: now,
        updated_at: now
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
    const ruleIndex = memoryDb.document_release_rules.findIndex(
      r => r.id === id && r.owner_id === req.user?.id
    );

    if (ruleIndex === -1) {
      res.status(404).json({ error: 'Release rule not found.' });
      return;
    }

    const rule = memoryDb.document_release_rules[ruleIndex];
    memoryDb.document_release_rules.splice(ruleIndex, 1);
    saveMemoryDb();

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
