import { v4 as uuidv4 } from 'uuid';
import { query, memoryDb, saveMemoryDb } from '../db';
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
    let owner: any = null;
    let settings: any = null;

    try {
      const oRes = await query('SELECT id, name, email FROM users WHERE id = $1', [ownerId]);
      if (oRes.rows && oRes.rows.length > 0) owner = oRes.rows[0];

      const sRes = await query('SELECT * FROM owner_settings WHERE owner_id = $1', [ownerId]);
      if (sRes.rows && sRes.rows.length > 0) settings = sRes.rows[0];
    } catch (err: any) {
      console.warn('[LifecycleService:CheckInQuery:Warning]', err.message);
    }

    if (!owner) owner = memoryDb.users.find(u => u.id === ownerId);
    if (!settings) settings = memoryDb.owner_settings.find(s => s.owner_id === ownerId) || {
      check_in_interval_days: 30,
      grace_period_days: 7,
      warning_days: 5
    };

    if (!owner) throw new Error('Owner account not found');

    const now = new Date();
    const intervalDays = settings.check_in_interval_days || 30;
    const nextDeadline = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    const checkInId = uuidv4();

    // 1. Record check-in in RDS
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

    try {
      await query(
        `INSERT INTO check_ins (id, owner_id, check_in_timestamp, check_in_type, ip_address, user_agent, next_deadline_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [checkInId, ownerId, now, checkInType, ipAddress, userAgent, nextDeadline, now]
      );

      // Update user last_check_in_at
      await query('UPDATE users SET last_check_in_at = $1, updated_at = $2 WHERE id = $3', [now, now, ownerId]);

      // Upsert account_lifecycle in RDS
      const reason = `Check-in confirmed. Next deadline in ${intervalDays} days`;
      await query(
        `INSERT INTO account_lifecycle (id, owner_id, current_state, last_successful_check_in, next_check_in_deadline, release_execution_state, state_transition_reason, updated_at)
         VALUES ($1, $2, 'ACTIVE', $3, $4, 'NONE', $5, $6)
         ON CONFLICT (owner_id)
         DO UPDATE SET current_state = 'ACTIVE', last_successful_check_in = $3, next_check_in_deadline = $4, flagged_inactive_at = NULL, grace_period_ends_at = NULL, release_execution_state = 'NONE', state_transition_reason = $5, updated_at = $6`,
        [uuidv4(), ownerId, now, nextDeadline, reason, now]
      );
    } catch (err: any) {
      console.warn('[LifecycleService:CheckInRDS:Warning]', err.message);
    }

    // Memory mirror
    memoryDb.check_ins.unshift(checkInRecord);
    owner.last_check_in_at = now.toISOString();

    let lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === ownerId);
    const previousState = lifecycle?.current_state || 'ACTIVE';

    if (!lifecycle) {
      lifecycle = {
        id: uuidv4(),
        owner_id: ownerId,
        current_state: 'ACTIVE',
        last_successful_check_in: now.toISOString(),
        next_check_in_deadline: nextDeadline.toISOString(),
        flagged_inactive_at: null,
        grace_period_ends_at: null,
        release_execution_state: 'NONE',
        state_transition_reason: 'Initial check-in established',
        updated_at: now.toISOString()
      };
      memoryDb.account_lifecycle.push(lifecycle);
    } else {
      const wasInGracePeriod = lifecycle.current_state === 'GRACE_PERIOD' || lifecycle.current_state === 'INACTIVE_PENDING';
      lifecycle.current_state = 'ACTIVE';
      lifecycle.last_successful_check_in = now.toISOString();
      lifecycle.next_check_in_deadline = nextDeadline.toISOString();
      lifecycle.flagged_inactive_at = null;
      lifecycle.grace_period_ends_at = null;
      lifecycle.release_execution_state = 'NONE';
      lifecycle.state_transition_reason = wasInGracePeriod
        ? `Pending release safely aborted by owner check-in`
        : `Check-in confirmed. Next deadline in ${intervalDays} days`;
      lifecycle.updated_at = now.toISOString();
    }

    saveMemoryDb();

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
        previousState,
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

    let lifecycles: any[] = [];
    try {
      const lRes = await query('SELECT * FROM account_lifecycle');
      if (lRes.rows && lRes.rows.length > 0) lifecycles = lRes.rows;
    } catch {
      lifecycles = memoryDb.account_lifecycle;
    }
    if (lifecycles.length === 0) lifecycles = memoryDb.account_lifecycle;

    for (const lifecycle of lifecycles) {
      let owner: any = null;
      let settings: any = null;

      try {
        const uRes = await query('SELECT * FROM users WHERE id = $1', [lifecycle.owner_id]);
        if (uRes.rows && uRes.rows.length > 0) owner = uRes.rows[0];

        const sRes = await query('SELECT * FROM owner_settings WHERE owner_id = $1', [lifecycle.owner_id]);
        if (sRes.rows && sRes.rows.length > 0) settings = sRes.rows[0];
      } catch {
        // Fallback
      }

      if (!owner) owner = memoryDb.users.find(u => u.id === lifecycle.owner_id);
      if (!settings) settings = memoryDb.owner_settings.find(s => s.owner_id === lifecycle.owner_id) || {
        grace_period_days: 7,
        warning_days: 5
      };

      if (!owner || owner.account_status !== 'ACTIVE') continue;

      // Check if simulated in memoryStore (e.g. in test suites that alter memoryDb.account_lifecycle directly)
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

        if (memLife) {
          memLife.current_state = 'GRACE_PERIOD';
          memLife.grace_period_ends_at = graceEnd.toISOString();
        }

        try {
          await query(
            `UPDATE account_lifecycle
             SET current_state = 'GRACE_PERIOD', flagged_inactive_at = $1, grace_period_ends_at = $2, state_transition_reason = $3, updated_at = $4
             WHERE id = $5`,
            [now, graceEnd, reason, now, lifecycle.id]
          );
        } catch (err: any) {
          console.warn('[LifecycleService:Phase1:Warning]', err.message);
        }

        lifecycle.current_state = 'GRACE_PERIOD';
        lifecycle.flagged_inactive_at = now.toISOString();
        lifecycle.grace_period_ends_at = graceEnd.toISOString();
        lifecycle.state_transition_reason = reason;
        lifecycle.updated_at = now.toISOString();
        gracePeriodStartedCount++;

        // Notify Nominees & Owner
        let nominees: any[] = [];
        try {
          const nRes = await query('SELECT * FROM nominees WHERE owner_id = $1 AND invitation_status = \'ACCEPTED\'', [lifecycle.owner_id]);
          if (nRes.rows) nominees = nRes.rows;
        } catch {
          nominees = memoryDb.nominees.filter(n => n.owner_id === lifecycle.owner_id && n.invitation_status === 'ACCEPTED');
        }

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

        try {
          await query(
            `UPDATE account_lifecycle
             SET current_state = 'ACCESS_GRANTED', release_execution_state = 'EXECUTED', state_transition_reason = $1, updated_at = $2
             WHERE id = $3`,
            [reason, now, lifecycle.id]
          );
        } catch (err: any) {
          console.warn('[LifecycleService:Phase2:Warning]', err.message);
        }

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

        // Fetch release rules from RDS
        let rules: any[] = [];
        try {
          const rRes = await query('SELECT * FROM document_release_rules WHERE owner_id = $1 AND rule_status = \'ACTIVE\'', [lifecycle.owner_id]);
          if (rRes.rows && rRes.rows.length > 0) rules = rRes.rows;
        } catch {
          rules = memoryDb.document_release_rules.filter(r => r.owner_id === lifecycle.owner_id && r.rule_status === 'ACTIVE');
        }
        if (rules.length === 0) {
          rules = memoryDb.document_release_rules.filter(r => r.owner_id === lifecycle.owner_id && r.rule_status === 'ACTIVE');
        }

        for (const rule of rules) {
          let nominee: any = null;
          try {
            const nRes = await query('SELECT * FROM nominees WHERE id = $1', [rule.nominee_id]);
            if (nRes.rows && nRes.rows.length > 0) nominee = nRes.rows[0];
          } catch {
            nominee = memoryDb.nominees.find(n => n.id === rule.nominee_id);
          }
          if (!nominee) nominee = memoryDb.nominees.find(n => n.id === rule.nominee_id);
          if (!nominee) continue;

          const grantId = uuidv4();
          const expiresAt = rule.access_duration_days
            ? new Date(now.getTime() + rule.access_duration_days * 24 * 60 * 60 * 1000)
            : null;

          try {
            await query(
              `INSERT INTO release_grants (id, owner_id, nominee_id, nominee_user_id, document_id, rule_id, grant_status, granted_at, expires_at, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9)
               ON CONFLICT (nominee_id, document_id) DO NOTHING`,
              [grantId, lifecycle.owner_id, rule.nominee_id, nominee.nominee_user_id || null, rule.document_id, rule.id, now, expiresAt, now]
            );
          } catch (err: any) {
            console.warn('[LifecycleService:GrantRDS:Warning]', err.message);
          }

          const grantRecord = {
            id: grantId,
            owner_id: lifecycle.owner_id,
            nominee_id: rule.nominee_id,
            nominee_user_id: nominee.nominee_user_id || null,
            document_id: rule.document_id,
            rule_id: rule.id,
            grant_status: 'ACTIVE',
            granted_at: now.toISOString(),
            expires_at: expiresAt ? expiresAt.toISOString() : null,
            created_at: now.toISOString()
          };
          if (!memoryDb.release_grants.some(g => g.nominee_id === rule.nominee_id && g.document_id === rule.document_id)) {
            memoryDb.release_grants.push(grantRecord);
          }

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

    saveMemoryDb();

    return {
      evaluatedCount: lifecycles.length,
      gracePeriodStartedCount,
      releasedCount
    };
  }

  public static async simulateInactivityForDemo(ownerId: string) {
    const now = new Date();
    const pastDeadline = new Date(now.getTime() - 10000);

    try {
      await query(
        `UPDATE account_lifecycle
         SET next_check_in_deadline = $1, current_state = 'ACTIVE', updated_at = $2
         WHERE owner_id = $3`,
        [pastDeadline, now, ownerId]
      );
    } catch {
      // Fallback
    }

    const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === ownerId);
    if (lifecycle) {
      lifecycle.next_check_in_deadline = pastDeadline.toISOString();
      lifecycle.current_state = 'ACTIVE';
    }

    return this.evaluateInactivityEngine();
  }
}
