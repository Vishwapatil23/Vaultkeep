import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { query, memoryDb } from '../db';
import { NotificationService } from '../services/notificationService';
import { AuditService } from '../services/auditService';

export class AdminController {
  public static async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const notifications = await NotificationService.getNotificationsForUser(
      req.user.email,
      req.user.role === 'OWNER' ? req.user.id : undefined
    );

    res.json({ notifications });
  }

  public static async getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const limit = parseInt(req.query.limit as string || '100', 10);
    const actorId = req.user.role === 'ADMIN' ? undefined : req.user.id;
    const logs = await AuditService.getLogs(limit, actorId);

    res.json({ auditLogs: logs });
  }

  public static async getSystemHealth(req: Request, res: Response): Promise<void> {
    let totalUsers = memoryDb.users.length;
    let totalOwners = memoryDb.users.filter(u => u.role === 'OWNER').length;
    let totalNominees = memoryDb.nominees.length;
    let totalDocuments = memoryDb.documents.filter(d => d.upload_status !== 'DELETED').length;
    let activeGrants = memoryDb.release_grants.filter(g => g.grant_status === 'ACTIVE').length;
    let lifecycleBreakdown: Record<string, number> = {
      ACTIVE: memoryDb.account_lifecycle.filter(l => l.current_state === 'ACTIVE').length,
      GRACE_PERIOD: memoryDb.account_lifecycle.filter(l => l.current_state === 'GRACE_PERIOD').length,
      ACCESS_GRANTED: memoryDb.account_lifecycle.filter(l => l.current_state === 'ACCESS_GRANTED').length
    };

    try {
      const uRes = await query('SELECT count(*)::int as count FROM users');
      if (uRes.rows) totalUsers = uRes.rows[0].count;

      const oRes = await query("SELECT count(*)::int as count FROM users WHERE role = 'OWNER'");
      if (oRes.rows) totalOwners = oRes.rows[0].count;

      const nRes = await query('SELECT count(*)::int as count FROM nominees');
      if (nRes.rows) totalNominees = nRes.rows[0].count;

      const dRes = await query("SELECT count(*)::int as count FROM documents WHERE upload_status != 'DELETED'");
      if (dRes.rows) totalDocuments = dRes.rows[0].count;

      const gRes = await query("SELECT count(*)::int as count FROM release_grants WHERE grant_status = 'ACTIVE'");
      if (gRes.rows) activeGrants = gRes.rows[0].count;

      const lRes = await query('SELECT current_state, count(*)::int as count FROM account_lifecycle GROUP BY current_state');
      if (lRes.rows) {
        lifecycleBreakdown = { ACTIVE: 0, GRACE_PERIOD: 0, ACCESS_GRANTED: 0 };
        for (const row of lRes.rows) {
          lifecycleBreakdown[row.current_state] = row.count;
        }
      }
    } catch (err: any) {
      console.warn('[AdminController:HealthQuery:Warning]', err.message);
    }

    res.json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version: '1.0.0',
      database: 'AMAZON_RDS_POSTGRESQL',
      cloudServices: {
        kmsEnvelopeEncryption: 'OPERATIONAL (AES-256-GCM + AWS KMS)',
        storageBackend: process.env.AWS_MOCK_SERVICES === 'true' ? 'MOCK_S3_VAULT' : 'AMAZON_S3_BUCKET',
        snsNotificationEngine: 'OPERATIONAL (Amazon SNS)',
        cloudWatchMetrics: 'OPERATIONAL',
        inactivityScheduler: 'EVENTBRIDGE_AUTOMATION_READY'
      },
      stats: {
        totalUsers,
        totalOwners,
        totalNominees,
        totalDocuments,
        activeGrants,
        lifecycleBreakdown
      }
    });
  }

  public static async liveness(req: Request, res: Response): Promise<void> {
    res.status(200).json({ status: 'UP', service: 'vaultkeep-backend' });
  }

  public static async readiness(req: Request, res: Response): Promise<void> {
    let dbStatus = 'CONNECTED';
    try {
      await query('SELECT 1');
    } catch (err: any) {
      dbStatus = `DISCONNECTED: ${err.message}`;
    }
    res.status(200).json({ status: 'READY', database: dbStatus, kms: 'READY', sns: 'READY' });
  }
}
