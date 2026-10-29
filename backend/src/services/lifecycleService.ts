import { v4 as uuidv4 } from 'uuid';
import { memoryDb, saveMemoryDb } from '../db';
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
    const owner = memoryDb.users.find(u => u.id === ownerId);
    if (!owner) throw new Error('Owner account not found');

    const settings = memoryDb.owner_settings.find(s => s.owner_id === ownerId) || {
      check_in_interval_days: 90,
      grace_period_days: 7,
      warning_days: 5
    };

    const now = new Date();
    const intervalDays = settings.check_in_interval_days || 90;
    const nextDeadline = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    // Record check-in
    const checkInRecord = {
      id: uuidv4(),
      owner_id: ownerId,
      check_in_timestamp: now.toISOString(),
      check_in_type: checkInType,
      ip_address: ipAddress,
      user_agent: userAgent,
      next_deadline_at: nextDeadline.toISOString(),
      created_at: now.toISOString()
    };
    memoryDb.check_ins.unshift(checkInRecord);

    // Update user record
    owner.last_check_in_at = now.toISOString();

    // Update or insert lifecycle record
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
      // Abort grace period if currently active
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
   * Evaluates inactivity across all registered accounts.
   * Executed on a scheduled basis (simulating EventBridge + Lambda trigger).
   */
  public static async evaluateInactivityEngine(): Promise<{
    evaluatedCount: number;
    gracePeriodStartedCount: number;
    releasedCount: number;
  }> {
    const now = new Date();
    let gracePeriodStartedCount = 0;
    let releasedCount = 0;

    for (const lifecycle of memoryDb.account_lifecycle) {
      const owner = memoryDb.users.find(u => u.id === lifecycle.owner_id);
      if (!owner || owner.account_status !== 'ACTIVE') continue;

      const settings = memoryDb.owner_settings.find(s => s.owner_id === lifecycle.owner_id) || {
        grace_period_days: 7,
        warning_days: 5
      };

      const deadline = new Date(lifecycle.next_check_in_deadline);

      // Phase 1: Check if check-in deadline has passed while still in ACTIVE state
      if (lifecycle.current_state === 'ACTIVE' && now >= deadline) {
        lifecycle.current_state = 'GRACE_PERIOD';
        lifecycle.flagged_inactive_at = now.toISOString();
        const graceEnd = new Date(now.getTime() + settings.grace_period_days * 24 * 60 * 60 * 1000);
        lifecycle.grace_period_ends_at = graceEnd.toISOString();
        lifecycle.state_transition_reason = `Check-in overdue. Grace period initiated until ${graceEnd.toISOString()}`;
        lifecycle.updated_at = now.toISOString();
        gracePeriodStartedCount++;

        // Notify Nominees & Owner
        const nominees = memoryDb.nominees.filter(n => n.owner_id === lifecycle.owner_id && n.invitation_status === 'ACCEPTED');
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
        lifecycle.current_state = 'ACCESS_GRANTED';
        lifecycle.release_execution_state = 'EXECUTED';
        lifecycle.state_transition_reason = `Grace period expired on ${lifecycle.grace_period_ends_at}. Document access conditionally granted to approved nominees.`;
        lifecycle.updated_at = now.toISOString();
        releasedCount++;

        // Generate Release Grants based on explicit confirmed rules
        const rules = memoryDb.document_release_rules.filter(
          r => r.owner_id === lifecycle.owner_id && r.rule_status === 'ACTIVE'
        );

        for (const rule of rules) {
          const nominee = memoryDb.nominees.find(n => n.id === rule.nominee_id);
          if (!nominee) continue;

          // Check for existing grant (idempotency safeguard)
          const existingGrant = memoryDb.release_grants.find(
            g => g.nominee_id === rule.nominee_id && g.document_id === rule.document_id
          );

          if (!existingGrant) {
            const expiresAt = rule.access_duration_days
              ? new Date(now.getTime() + rule.access_duration_days * 24 * 60 * 60 * 1000).toISOString()
              : null;

            const grant = {
              id: uuidv4(),
              owner_id: lifecycle.owner_id,
              nominee_id: rule.nominee_id,
              nominee_user_id: nominee.nominee_user_id || null,
              document_id: rule.document_id,
              rule_id: rule.id,
              grant_status: 'ACTIVE',
              granted_at: now.toISOString(),
              expires_at: expiresAt,
              created_at: now.toISOString()
            };

            memoryDb.release_grants.push(grant);

            // Send Access Granted notification via SNS
            await NotificationService.sendNotification({
              recipientEmail: nominee.email,
              recipientRole: 'NOMINEE',
              notificationType: 'ACCESS_GRANTED',
              ownerId: lifecycle.owner_id,
              eventReferenceId: grant.id,
              subject: `Document Access Granted by VaultKeep Legacy Policy`,
              messageBody: `The grace period for ${owner.name} has concluded. You have been granted authenticated access to authorized documents designated for you. Please log in to your VaultKeep nominee portal to view released documents.`
            });
          }
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
      evaluatedCount: memoryDb.account_lifecycle.length,
      gracePeriodStartedCount,
      releasedCount
    };
  }

  /**
   * Helper method for demo/testing: Simulate immediate inactivity or force trigger grace period.
   */
  public static async simulateInactivityForDemo(ownerId: string, gracePeriodMinutes = 2) {
    const lifecycle = memoryDb.account_lifecycle.find(l => l.owner_id === ownerId);
    if (!lifecycle) throw new Error('Lifecycle record not found');

    const now = new Date();
    // Set next deadline in the past
    lifecycle.next_check_in_deadline = new Date(now.getTime() - 10000).toISOString();
    return this.evaluateInactivityEngine();
  }
}
