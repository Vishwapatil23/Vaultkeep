import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { v4 as uuidv4 } from 'uuid';
import { memoryDb } from '../db';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const CLOUDWATCH_NAMESPACE = process.env.CLOUDWATCH_NAMESPACE || 'VaultKeep/Application';
const USE_MOCK = process.env.AWS_MOCK_SERVICES === 'true';

let cwClient: CloudWatchClient | null = null;
if (!USE_MOCK) {
  cwClient = new CloudWatchClient({ region: AWS_REGION });
}

export interface AuditLogEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export class AuditService {
  /**
   * Logs an immutable security-relevant audit event and publishes CloudWatch metrics.
   */
  public static async recordEvent(entry: AuditLogEntry): Promise<any> {
    const logId = uuidv4();
    const correlationId = entry.correlationId || uuidv4();

    const record = {
      id: logId,
      actor_id: entry.actorId || null,
      actor_email: entry.actorEmail || 'SYSTEM',
      actor_role: entry.actorRole || 'SYSTEM',
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId || null,
      outcome: entry.outcome,
      ip_address: entry.ipAddress || '127.0.0.1',
      user_agent: entry.userAgent || 'VaultKeep-Internal',
      correlation_id: correlationId,
      metadata: entry.metadata || {},
      created_at: new Date().toISOString()
    };

    memoryDb.audit_logs.unshift(record);

    // Publish CloudWatch Metric for specific security and operational actions
    await this.publishCloudWatchMetric(entry.action, entry.outcome);

    return record;
  }

  /**
   * Publishes custom CloudWatch metrics for alarming and dashboards.
   */
  private static async publishCloudWatchMetric(action: string, outcome: string) {
    if (USE_MOCK || !cwClient) return;

    try {
      let metricName = 'ApplicationActivity';
      if (action.includes('DECRYPT') && outcome !== 'SUCCESS') {
        metricName = 'FailedDecryptionAttempts';
      } else if (outcome === 'DENIED') {
        metricName = 'UnauthorizedAccessAttempts';
      } else if (action === 'CHECK_IN_PERFORMED') {
        metricName = 'CheckInSuccessCount';
      } else if (action === 'LIFECYCLE_TRANSITION') {
        metricName = 'LifecycleTransitions';
      }

      const command = new PutMetricDataCommand({
        Namespace: CLOUDWATCH_NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'Action', Value: action },
              { Name: 'Outcome', Value: outcome }
            ]
          }
        ]
      });

      await cwClient.send(command);
    } catch (err: any) {
      console.warn(`[CloudWatch Metric] Skipped: ${err.message}`);
    }
  }

  /**
   * Records a security event (e.g. rate limit, failed logins, invalid tokens).
   */
  public static async recordSecurityEvent(
    eventType: string,
    actorEmail: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ) {
    const secEvent = {
      id: uuidv4(),
      event_type: eventType,
      actor_email: actorEmail,
      ip_address: ipAddress || '127.0.0.1',
      user_agent: userAgent || 'VaultKeep-Client',
      details,
      created_at: new Date().toISOString()
    };

    memoryDb.security_events.unshift(secEvent);

    await this.recordEvent({
      actorEmail,
      action: `SECURITY_EVENT_${eventType}`,
      resourceType: 'SECURITY',
      outcome: 'DENIED',
      ipAddress,
      userAgent,
      metadata: details
    });

    return secEvent;
  }

  public static async getLogs(limit = 100, actorId?: string) {
    let logs = [...memoryDb.audit_logs];
    if (actorId) {
      logs = logs.filter(l => l.actor_id === actorId);
    }
    return logs.slice(0, limit);
  }
}
