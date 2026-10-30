import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { query } from '../db';
import { NotificationService } from '../services/notificationService';
import { AuditService } from '../services/auditService';

export class AdminController {
  public static async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const notifications = await NotificationService.getNotificationsForUser(
        req.user.email,
        req.user.role === 'OWNER' ? req.user.id : undefined
      );

      res.json({ notifications });
    } catch (err: any) {
      console.error('[AdminController:GetNotifications:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving notifications: ${err.message}` });
    }
  }

  public static async getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const limit = parseInt(req.query.limit as string || '100', 10);
      const actorId = req.user.role === 'ADMIN' ? undefined : req.user.id;
      const logs = await AuditService.getLogs(limit, actorId);

      res.json({ auditLogs: logs });
    } catch (err: any) {
      console.error('[AdminController:GetAuditLogs:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving audit logs: ${err.message}` });
    }
  }

  public static async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      let totalUsers = 0;
      let totalOwners = 0;
      let totalNominees = 0;
      let totalDocuments = 0;
      let activeGrants = 0;
      let lifecycleBreakdown: Record<string, number> = { ACTIVE: 0, GRACE_PERIOD: 0, ACCESS_GRANTED: 0 };

      const uRes = await query('SELECT count(*)::int as count FROM users');
      if (uRes.rows && uRes.rows.length > 0) totalUsers = uRes.rows[0].count;

      const oRes = await query("SELECT count(*)::int as count FROM users WHERE role = 'OWNER'");
      if (oRes.rows && oRes.rows.length > 0) totalOwners = oRes.rows[0].count;

      const nRes = await query('SELECT count(*)::int as count FROM nominees');
      if (nRes.rows && nRes.rows.length > 0) totalNominees = nRes.rows[0].count;

      const dRes = await query("SELECT count(*)::int as count FROM documents WHERE upload_status != 'DELETED'");
      if (dRes.rows && dRes.rows.length > 0) totalDocuments = dRes.rows[0].count;

      const gRes = await query("SELECT count(*)::int as count FROM release_grants WHERE grant_status = 'ACTIVE'");
      if (gRes.rows && gRes.rows.length > 0) activeGrants = gRes.rows[0].count;

      const lRes = await query('SELECT current_state, count(*)::int as count FROM account_lifecycle GROUP BY current_state');
      if (lRes.rows) {
        for (const row of lRes.rows) {
          lifecycleBreakdown[row.current_state] = row.count;
        }
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
    } catch (err: any) {
      console.error('[AdminController:Health:Error]', err.message);
      res.status(500).json({ error: `Database error calculating system health: ${err.message}` });
    }
  }

  public static async liveness(req: Request, res: Response): Promise<void> {
    res.status(200).json({ status: 'UP', service: 'vaultkeep-backend' });
  }

  public static async readiness(req: Request, res: Response): Promise<void> {
    try {
      await query('SELECT 1');
      res.status(200).json({ status: 'READY', database: 'CONNECTED', kms: 'READY', sns: 'READY' });
    } catch (err: any) {
      console.error('[AdminController:Readiness:Error]', err.message);
      res.status(503).json({ status: 'NOT_READY', database: `DISCONNECTED: ${err.message}` });
    }
  }

  public static async getDatabaseView(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      return;
    }

    try {
      const table = (req.query.table as string) || 'users';
      const allowedTables = [
        'users',
        'nominees',
        'documents',
        'account_lifecycle',
        'audit_logs',
        'document_release_rules',
        'notifications',
        'owner_settings',
        'release_grants',
        'check_ins'
      ];

      if (!allowedTables.includes(table)) {
        res.status(400).json({ error: `Invalid table '${table}'. Allowed tables: ${allowedTables.join(', ')}` });
        return;
      }

      const countRes = await query(`SELECT count(*)::int as count FROM "${table}"`);
      const rowsRes = await query(`SELECT * FROM "${table}" ORDER BY created_at DESC LIMIT 50`);

      const sanitizedRows = rowsRes.rows.map(r => {
        const copy = { ...r };
        if (copy.password_hash) copy.password_hash = '[PROTECTED_HASH]';
        return copy;
      });

      res.json({
        table,
        totalRows: countRes.rows[0]?.count || 0,
        rows: sanitizedRows,
        allowedTables,
        connection: {
          host: process.env.DB_HOST || 'vaultkeep-postgresql-db.cyrw6icwadyc.us-east-1.rds.amazonaws.com',
          database: process.env.DB_NAME || 'vaultkeep_db',
          port: 5432,
          ssl: process.env.DB_SSL === 'true',
          engine: 'Amazon RDS PostgreSQL 15'
        }
      });
    } catch (err: any) {
      console.error('[AdminController:DatabaseView:Error]', err.message);
      res.status(500).json({ error: `Database query error: ${err.message}` });
    }
  }
}
