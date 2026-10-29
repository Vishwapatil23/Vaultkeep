import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { memoryDb, saveMemoryDb } from '../db';
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

    const checkIns = memoryDb.check_ins.filter(c => c.owner_id === req.user?.id);
    res.json({ checkIns });
  }

  public static async getStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === req.user?.id);
    const settings = memoryDb.owner_settings.find(s => s.owner_id === req.user?.id);
    const latestCheckIn = memoryDb.check_ins.find(c => c.owner_id === req.user?.id);

    res.json({
      lifecycle: lifecycle || {
        current_state: 'ACTIVE',
        next_check_in_deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      },
      settings: settings || {
        check_in_interval_days: 90,
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

    let settings = memoryDb.owner_settings.find(s => s.owner_id === req.user?.id);
    if (settings) {
      if (checkInIntervalDays) settings.check_in_interval_days = parseInt(checkInIntervalDays, 10);
      if (gracePeriodDays) settings.grace_period_days = parseInt(gracePeriodDays, 10);
      if (warningDays) settings.warning_days = parseInt(warningDays, 10);
      if (timezone) settings.timezone = timezone;
      settings.updated_at = new Date().toISOString();
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

  /**
   * Automation trigger (called by Lambda, EventBridge or Admin)
   */
  public static async evaluateInactivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Demonstration hook (same contract as standalone_server.js): { forceRelease: true }
      // ends the caller's own running grace period now so the release can be shown live.
      if (req.body?.forceRelease && req.user) {
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

  /**
   * Controlled Demonstration Hook: Simulates missed check-in to demonstrate transition to GRACE_PERIOD & ACCESS_GRANTED
   */
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
