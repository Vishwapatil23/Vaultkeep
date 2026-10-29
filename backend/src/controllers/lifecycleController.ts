import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { query } from '../db';
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
      console.error('[LifecycleController:PerformCheckIn:Error]', err.message);
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
      res.json({ checkIns: result.rows || [] });
    } catch (err: any) {
      console.error('[LifecycleController:GetCheckIns:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving check-ins: ${err.message}` });
    }
  }

  public static async getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    try {
      const lRes = await query(`SELECT * FROM account_lifecycle WHERE owner_id = $1`, [req.user.id]);
      const lifecycle = lRes.rows && lRes.rows.length > 0 ? lRes.rows[0] : null;

      const sRes = await query(`SELECT * FROM owner_settings WHERE owner_id = $1`, [req.user.id]);
      const settings = sRes.rows && sRes.rows.length > 0 ? sRes.rows[0] : null;

      const cRes = await query(`SELECT * FROM check_ins WHERE owner_id = $1 ORDER BY check_in_timestamp DESC LIMIT 1`, [req.user.id]);
      const latestCheckIn = cRes.rows && cRes.rows.length > 0 ? cRes.rows[0] : null;

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
    } catch (err: any) {
      console.error('[LifecycleController:GetStatus:Error]', err.message);
      res.status(500).json({ error: `Database error retrieving lifecycle status: ${err.message}` });
    }
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

      const sRes = await query('SELECT * FROM owner_settings WHERE owner_id = $1', [req.user.id]);
      const settings = sRes.rows && sRes.rows.length > 0 ? sRes.rows[0] : null;

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
    } catch (err: any) {
      console.error('[LifecycleController:UpdatePolicy:Error]', err.message);
      res.status(500).json({ error: `Database error updating policy settings: ${err.message}` });
    }
  }

  public static async evaluateInactivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (req.body?.forceRelease && req.user) {
        await query(
          `UPDATE account_lifecycle
           SET grace_period_ends_at = NOW() - INTERVAL '1 second', updated_at = NOW()
           WHERE owner_id = $1 AND current_state = 'GRACE_PERIOD'`,
          [req.user.id]
        );
      }

      const summary = await LifecycleService.evaluateInactivityEngine();
      res.json({
        message: 'Inactivity evaluation execution completed.',
        summary
      });
    } catch (err: any) {
      console.error('[LifecycleController:EvaluateInactivity:Error]', err.message);
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
      console.error('[LifecycleController:SimulateInactivity:Error]', err.message);
      res.status(500).json({ error: err.message });
    }
  }
}
