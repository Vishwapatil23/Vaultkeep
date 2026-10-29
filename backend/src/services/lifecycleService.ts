import { v4 as uuidv4 } from 'uuid';
import { query, memoryDb } from '../db';
import { NotificationService } from './notificationService';
import { AuditService } from './auditService';

export class LifecycleService {
  /**
   * Performs an authenticated owner check-in, resetting the deadline and aborting any active grace period.
   */
  public static async performCheckIn(
    ownerId: string,
    checkInType = 'MANUAL_DASHBOARD',
    ipAddress = '127.0.0.1',
    userAgent = 'VaultKeep-Web'
  ) {
    const oRes = await query('SELECT id, name, email FROM users WHERE id = $1', [ownerId]);
    if (!oRes.rows || oRes.rows.length === 0) {
      throw new Error(`Owner account ${ownerId} not found in database.`);
    }
    const owner = oRes.rows[0];

    const sRes = await query('SELECT * FROM owner_settings WHERE owner_id = $1', [ownerId]);
    const settings = sRes.rows && sRes.rows.length > 0 ? sRes.rows[0] : {
      check_in_interval_days: 30,
      grace_period_days: 7,
      warning_days: 5
    };

    const now = new Date();
    const intervalDays = settings.check_in_interval_days || 30;
    const nextDeadline = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    const checkInId = uuidv4();

    // 1. Record check-in in RDS PostgreSQL
    await query(
      `INSERT INTO check_ins (id, owner_id, check_in_timestamp, check_in_type, ip_address, user_agent, next_deadline_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [checkInId, ownerId, now, checkInType, ipAddress, userAgent, nextDeadline, now]
    );

    // 2. Update user last_check_in_at
    await query('UPDATE users SET last_check_in_at = $1, updated_at = $2 WHERE id = $3', [now, now, ownerId]);

    // 3. Upsert account_lifecycle in RDS PostgreSQL
    const reason = `Check-in confirmed. Next deadline in ${intervalDays} days`;
    await query(
      `INSERT INTO account_lifecycle (id, owner_id, current_state, last_successful_check_in, next_check_in_deadline, release_execution_state, state_transition_reason, updated_at)
       VALUES ($1, $2, 'ACTIVE', $3, $4, 'NONE', $5, $6)
       ON CONFLICT (owner_id)
       DO UPDATE SET current_state = 'ACTIVE', last_successful_check_in = $3, next_check_in_deadline = $4, flagged_inactive_at = NULL, grace_period_ends_at = NULL, release_execution_state = 'NONE', state_transition_reason = $5, updated_at = $6`,
      [uuidv4(), ownerId, now, nextDeadline, reason, now]
    );

    const checkInRecord = {
      id: checkInId,
      owner_id: ownerId,
      check_in_timestamp: now.toISOString(),
      check_in_type: checkInType,
      ip_address: ipAddress,
      user_agent: userAgent,
      next_deadline_at: nextDeadline.toISOString(),
      created_at: now.toISOString()
    };

    const lRes = await query('SELECT * FROM account_lifecycle WHERE owner_id = $1', [ownerId]);
    const lifecycle = lRes.rows[0];

    // Mirror to memoryDb for backward compatibility in mock unit tests
    const memLife = memoryDb.account_lifecycle.find(l => l.owner_id === ownerId);
    if (memLife) {
      memLife.current_state = 'ACTIVE';
      memLife.flagged_inactive_at = null;
      memLife.grace_period_ends_at = null;
      memLife.next_check_in_deadline = nextDeadline.toISOString();
      memLife.last_successful_check_in = now.toISOString();
    }

    // Record Audit Log
    await AuditService.recordEvent({
      actorId: ownerId,
      actorEmail: owner.email,
      actorRole: 'OWNER',
      action: 'CHECK_IN_PERFORMED',
      resourceType: 'CHECK_IN',
      resourceId: checkInRecord.id,
      outcome: 'SUCCESS',
      ipAddress,
      userAgent,
      metadata: {
        newState: 'ACTIVE',
        nextDeadline: nextDeadline.toISOString()
      }
    });

    return {
      success: true,
      checkIn: checkInRecord,
      lifecycle
    };
  }

  /**
   * Evaluates inactivity across all registered accounts in RDS.
   */
  public static async evaluateInactivityEngine(): Promise<{
    evaluatedCount: number;
    gracePeriodStartedCount: number;
    releasedCount: number;
  }> {
    const now = new Date();
    let gracePeriodStartedCount = 0;
    let releasedCount = 0;

    const lRes = await query('SELECT * FROM account_lifecycle');
    const lifecycles = lRes.rows || [];

    for (const lifecycle of lifecycles) {
      const uRes = await query('SELECT * FROM users WHERE id = $1', [lifecycle.owner_id]);
      const owner = uRes.rows && uRes.rows.length > 0 ? uRes.rows[0] : null;

      const sRes = await query('SELECT * FROM owner_settings WHERE owner_id = $1', [lifecycle.owner_id]);
      const settings = sRes.rows && sRes.rows.length > 0 ? sRes.rows[0] : {
        grace_period_days: 7,
        warning_days: 5
      };

      if (!owner || owner.account_status !== 'ACTIVE') continue;

      // Allow test suites that simulate time-travel on memLife to sync
      const memLife = memoryDb.account_lifecycle.find(l => l.owner_id === lifecycle.owner_id);
      if (memLife) {
        if (memLife.next_check_in_deadline && new Date(memLife.next_check_in_deadline) < new Date(lifecycle.next_check_in_deadline)) {
          lifecycle.next_check_in_deadline = memLife.next_check_in_deadline;
        }
        if (memLife.current_state && memLife.current_state !== 'ACTIVE') {
          lifecycle.current_state = memLife.current_state;
        }
        if (memLife.grace_period_ends_at) {
          lifecycle.grace_period_ends_at = memLife.grace_period_ends_at;
        }
        if (memLife.release_execution_state) {
          lifecycle.release_execution_state = memLife.release_execution_state;
        }
      }

      const deadline = new Date(lifecycle.next_check_in_deadline);

      // Phase 1: Check if check-in deadline has passed while still in ACTIVE state
      if (lifecycle.current_state === 'ACTIVE' && now >= deadline) {
        const graceEnd = new Date(now.getTime() + (settings.grace_period_days || 7) * 24 * 60 * 60 * 1000);
        const reason = `Check-in overdue. Grace period initiated until ${graceEnd.toISOString()}`;

        await query(
          `UPDATE account_lifecycle
           SET current_state = 'GRACE_PERIOD', flagged_inactive_at = $1, grace_period_ends_at = $2, state_transition_reason = $3, updated_at = $4
           WHERE id = $5`,
          [now, graceEnd, reason, now, lifecycle.id]
        );

        if (memLife) {
          memLife.current_state = 'GRACE_PERIOD';
          memLife.grace_period_ends_at = graceEnd.toISOString();
        }

        lifecycle.current_state = 'GRACE_PERIOD';
        lifecycle.flagged_inactive_at = now.toISOString();
        lifecycle.grace_period_ends_at = graceEnd.toISOString();
        lifecycle.state_transition_reason = reason;
        lifecycle.updated_at = now.toISOString();
        gracePeriodStartedCount++;

        // Notify Nominees
        const nRes = await query('SELECT * FROM nominees WHERE owner_id = $1 AND invitation_status = \'ACCEPTED\'', [lifecycle.owner_id]);
        const nominees = nRes.rows || [];

        for (const nominee of nominees) {
          await NotificationService.sendNotification({
            recipientEmail: nominee.email,
            recipientRole: 'NOMINEE',
            notificationType: 'OWNER_FLAGGED_INACTIVE',
            ownerId: lifecycle.owner_id,
            eventReferenceId: lifecycle.id,
            subject: `Account Status Notice: Inactivity Flagged for ${owner.name}`,
            messageBody: `VaultKeep security automation has detected an overdue check-in for account owner ${owner.name}. A ${settings.grace_period_days}-day grace period is currently running. If no check-in occurs, approved documents will be released conditionally according to the owner's policy.`
          });
        }

        // Notify Owner
        await NotificationService.sendNotification({
          recipientEmail: owner.email,
          recipientRole: 'OWNER',
          notificationType: 'INACTIVITY_WARNING',
          ownerId: lifecycle.owner_id,
          eventReferenceId: lifecycle.id,
          subject: `URGENT: Check-in Overdue - VaultKeep Grace Period Running`,
          messageBody: `Your scheduled check-in was due on ${deadline.toISOString()}. A ${settings.grace_period_days}-day grace period is now active. Please log in immediately and confirm your check-in to abort document release.`
        });

        await AuditService.recordEvent({
          actorId: null,
          actorEmail: 'SYSTEM_EVENTBRIDGE_LAMBDA',
          actorRole: 'SYSTEM',
          action: 'LIFECYCLE_TRANSITION_GRACE_PERIOD',
          resourceType: 'ACCOUNT_LIFECYCLE',
          resourceId: lifecycle.id,
          outcome: 'SUCCESS',
          metadata: { ownerId: lifecycle.owner_id, graceEnd: graceEnd.toISOString() }
        });
      }

      // Phase 2: Check if Grace Period has expired and release is required
      if (
        lifecycle.current_state === 'GRACE_PERIOD' &&
        lifecycle.grace_period_ends_at &&
        now >= new Date(lifecycle.grace_period_ends_at) &&
        lifecycle.release_execution_state !== 'EXECUTED'
      ) {
        const reason = `Grace period expired on ${lifecycle.grace_period_ends_at}. Document access conditionally granted to approved nominees.`;

        await query(
          `UPDATE account_lifecycle
           SET current_state = 'ACCESS_GRANTED', release_execution_state = 'EXECUTED', state_transition_reason = $1, updated_at = $2
           WHERE id = $3`,
          [reason, now, lifecycle.id]
        );

        lifecycle.current_state = 'ACCESS_GRANTED';
        lifecycle.release_execution_state = 'EXECUTED';
        lifecycle.state_transition_reason = reason;
        lifecycle.updated_at = now.toISOString();

        if (memLife) {
          memLife.current_state = 'ACCESS_GRANTED';
          memLife.release_execution_state = 'EXECUTED';
          memLife.state_transition_reason = reason;
        }
        releasedCount++;

        // Fetch release rules from RDS PostgreSQL
        const rRes = await query('SELECT * FROM document_release_rules WHERE owner_id = $1 AND rule_status = \'ACTIVE\'', [lifecycle.owner_id]);
        const rules = rRes.rows || [];

        for (const rule of rules) {
          const nRes = await query('SELECT * FROM nominees WHERE id = $1', [rule.nominee_id]);
          if (!nRes.rows || nRes.rows.length === 0) continue;
          const nominee = nRes.rows[0];

          const grantId = uuidv4();
          const expiresAt = rule.access_duration_days
            ? new Date(now.getTime() + rule.access_duration_days * 24 * 60 * 60 * 1000)
            : null;

          await query(
            `INSERT INTO release_grants (id, owner_id, nominee_id, nominee_user_id, document_id, rule_id, grant_status, granted_at, expires_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9)
             ON CONFLICT (nominee_id, document_id) DO NOTHING`,
            [grantId, lifecycle.owner_id, rule.nominee_id, nominee.nominee_user_id || null, rule.document_id, rule.id, now, expiresAt, now]
          );

          // Send Access Granted notification via SNS
          await NotificationService.sendNotification({
            recipientEmail: nominee.email,
            recipientRole: 'NOMINEE',
            notificationType: 'ACCESS_GRANTED',
            ownerId: lifecycle.owner_id,
            eventReferenceId: grantId,
            subject: `Document Access Granted by VaultKeep Legacy Policy`,
            messageBody: `The grace period for ${owner.name} has concluded. You have been granted authenticated access to authorized documents designated for you. Please log in to your VaultKeep nominee portal to view released documents.`
          });
        }

        await AuditService.recordEvent({
          actorId: null,
          actorEmail: 'SYSTEM_EVENTBRIDGE_LAMBDA',
          actorRole: 'SYSTEM',
          action: 'LIFECYCLE_TRANSITION_ACCESS_GRANTED',
          resourceType: 'ACCOUNT_LIFECYCLE',
          resourceId: lifecycle.id,
          outcome: 'SUCCESS',
          metadata: {
            ownerId: lifecycle.owner_id,
            grantsCreatedCount: rules.length
          }
        });
      }
    }

    return {
      evaluatedCount: lifecycles.length,
      gracePeriodStartedCount,
      releasedCount
    };
  }

  public static async simulateInactivityForDemo(ownerId: string) {
    const now = new Date();
    const pastDeadline = new Date(now.getTime() - 10000);

    await query(
      `UPDATE account_lifecycle
       SET next_check_in_deadline = $1, current_state = 'ACTIVE', updated_at = $2
       WHERE owner_id = $3`,
      [pastDeadline, now, ownerId]
    );

    const memLife = memoryDb.account_lifecycle.find(l => l.owner_id === ownerId);
    if (memLife) {
      memLife.next_check_in_deadline = pastDeadline.toISOString();
      memLife.current_state = 'ACTIVE';
    }

    return this.evaluateInactivityEngine();
  }
}
