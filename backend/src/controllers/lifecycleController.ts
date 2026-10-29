import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { query, memoryDb, saveMemoryDb } from '../db';
import { LifecycleService } from '../services/lifecycleService';
import { AuditService } from '../services/auditService';

export class LifecycleController {
  public static async performCheckIn(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await LifecycleService.performCheckIn(
        req.user.id,
        'MANUAL_DASHBOARD',
        req.ip,
        req.headers['user-agent']
      );

      res.json({
        message: 'Check-in confirmed successfully. Next inactivity deadline has been extended.',
        checkIn: result.checkIn,
        lifecycle: result.lifecycle
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getCheckIns(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await query(
        `SELECT id, owner_id, check_in_timestamp, check_in_type, ip_address, user_agent, next_deadline_at, created_at
         FROM check_ins
         WHERE owner_id = $1
         ORDER BY check_in_timestamp DESC
         LIMIT 50`,
        [req.user.id]
      );
      if (result.rows && result.rows.length > 0) {
        res.json({ checkIns: result.rows });
        return;
      }
    } catch (err: any) {
      console.warn('[LifecycleController:GetCheckIns:Warning]', err.message);
    }

    const checkIns = memoryDb.check_ins.filter(c => c.owner_id === req.user?.id);
    res.json({ checkIns });
  }

  public static async getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    let lifecycle: any = null;
    let settings: any = null;
    let latestCheckIn: any = null;

    try {
      const lRes = await query(`SELECT * FROM account_lifecycle WHERE owner_id = $1`, [req.user.id]);
      if (lRes.rows && lRes.rows.length > 0) lifecycle = lRes.rows[0];

      const sRes = await query(`SELECT * FROM owner_settings WHERE owner_id = $1`, [req.user.id]);
      if (sRes.rows && sRes.rows.length > 0) settings = sRes.rows[0];

      const cRes = await query(`SELECT * FROM check_ins WHERE owner_id = $1 ORDER BY check_in_timestamp DESC LIMIT 1`, [req.user.id]);
      if (cRes.rows && cRes.rows.length > 0) latestCheckIn = cRes.rows[0];
    } catch (err: any) {
      console.warn('[LifecycleController:GetStatus:Warning]', err.message);
    }

    if (!lifecycle) lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === req.user?.id);
    if (!settings) settings = memoryDb.owner_settings.find(s => s.owner_id === req.user?.id);
    if (!latestCheckIn) latestCheckIn = memoryDb.check_ins.find(c => c.owner_id === req.user?.id);

    res.json({
      lifecycle: lifecycle || {
        current_state: 'ACTIVE',
        next_check_in_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      settings: settings || {
        check_in_interval_days: 30,
        grace_period_days: 7,
        warning_days: 5
      },
      latestCheckIn
    });
  }

  public static async updatePolicy(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const { checkInIntervalDays, gracePeriodDays, warningDays, timezone } = req.body;

    if (checkInIntervalDays && (checkInIntervalDays < 1 || checkInIntervalDays > 365)) {
      res.status(400).json({ error: 'Check-in interval must be between 1 and 365 days.' });
      return;
    }
    if (gracePeriodDays && (gracePeriodDays < 1 || gracePeriodDays > 90)) {
      res.status(400).json({ error: 'Grace period must be between 1 and 90 days.' });
      return;
    }

    const now = new Date();
    try {
      await query(
        `UPDATE owner_settings
         SET check_in_interval_days = COALESCE($1, check_in_interval_days),
             grace_period_days = COALESCE($2, grace_period_days),
             warning_days = COALESCE($3, warning_days),
             timezone = COALESCE($4, timezone),
             updated_at = $5
         WHERE owner_id = $6`,
        [
          checkInIntervalDays ? parseInt(checkInIntervalDays, 10) : null,
          gracePeriodDays ? parseInt(gracePeriodDays, 10) : null,
          warningDays ? parseInt(warningDays, 10) : null,
          timezone || null,
          now,
          req.user.id
        ]
      );
    } catch (err: any) {
      console.warn('[LifecycleController:UpdatePolicy:Warning]', err.message);
    }

    let settings = memoryDb.owner_settings.find(s => s.owner_id === req.user?.id);
    if (settings) {
      if (checkInIntervalDays) settings.check_in_interval_days = parseInt(checkInIntervalDays, 10);
      if (gracePeriodDays) settings.grace_period_days = parseInt(gracePeriodDays, 10);
      if (warningDays) settings.warning_days = parseInt(warningDays, 10);
      if (timezone) settings.timezone = timezone;
      settings.updated_at = now.toISOString();
      saveMemoryDb();
    }

    await AuditService.recordEvent({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'LIFECYCLE_POLICY_UPDATED',
      resourceType: 'OWNER_SETTINGS',
      resourceId: settings?.id,
      outcome: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { checkInIntervalDays, gracePeriodDays, warningDays }
    });

    res.json({
      message: 'Inactivity policy settings updated successfully.',
      settings
    });
  }

  public static async evaluateInactivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (req.body?.forceRelease && req.user) {
        try {
          await query(
            `UPDATE account_lifecycle
             SET grace_period_ends_at = NOW() - INTERVAL '1 second', updated_at = NOW()
             WHERE owner_id = $1 AND current_state = 'GRACE_PERIOD'`,
            [req.user.id]
          );
        } catch {
          // Fallback
        }
        const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === req.user?.id);
        if (lifecycle && lifecycle.current_state === 'GRACE_PERIOD') {
          lifecycle.grace_period_ends_at = new Date(Date.now() - 1000).toISOString();
        }
      }

      const summary = await LifecycleService.evaluateInactivityEngine();
      res.json({
        message: 'Inactivity evaluation execution completed.',
        summary
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async simulateInactivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const result = await LifecycleService.simulateInactivityForDemo(req.user.id);
      res.json({
        message: 'Demonstration simulation: Check-in deadline expired. State transition triggered.',
        result
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
