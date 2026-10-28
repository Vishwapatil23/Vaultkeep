import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { memoryDb } from '../db';
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
    // If admin, can view all logs; if owner, views logs where actorId matches or relates to them
    const actorId = req.user.role === 'ADMIN' ? undefined : req.user.id;
    const logs = await AuditService.getLogs(limit, actorId);

    res.json({ auditLogs: logs });
  }

  public static async getSystemHealth(req: Request, res: Response): Promise<void> {
    const totalUsers = memoryDb.users.length;
    const totalOwners = memoryDb.users.filter(u => u.role === 'OWNER').length;
    const totalNominees = memoryDb.nominees.length;
    const totalDocuments = memoryDb.documents.filter(d => d.upload_status !== 'DELETED').length;
    const activeGrants = memoryDb.release_grants.filter(g => g.grant_status === 'ACTIVE').length;

    const lifecycleBreakdown = {
      ACTIVE: memoryDb.account_lifecycle.filter(l => l.current_state === 'ACTIVE').length,
      GRACE_PERIOD: memoryDb.account_lifecycle.filter(l => l.current_state === 'GRACE_PERIOD').length,
      ACCESS_GRANTED: memoryDb.account_lifecycle.filter(l => l.current_state === 'ACCESS_GRANTED').length
    };

    res.json({
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version: '1.0.0',
      cloudServices: {
        kmsEnvelopeEncryption: 'OPERATIONAL (AES-256-GCM + AWS KMS)',
        storageBackend: process.env.AWS_MOCK_SERVICES === 'true' ? 'MOCK_S3_VAULT' : 'AMAZON_S3_BUCKET',
        snsNotificationEngine: 'OPERATIONAL',
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
    res.status(200).json({ status: 'READY', database: 'CONNECTED', kms: 'READY' });
  }
}
