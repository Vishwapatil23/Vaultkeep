import { SNSClient, PublishCommand, SubscribeCommand, ListSubscriptionsByTopicCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USE_MOCK = process.env.AWS_MOCK_SERVICES === 'true';
const INACTIVITY_TOPIC_ARN = process.env.SNS_INACTIVITY_TOPIC_ARN || 'arn:aws:sns:us-east-1:327973843616:vaultkeep-inactivity-alerts';
const ACCESS_GRANTED_TOPIC_ARN = process.env.SNS_ACCESS_GRANTED_TOPIC_ARN || 'arn:aws:sns:us-east-1:327973843616:vaultkeep-access-granted';
const INVITATION_TOPIC_ARN = process.env.SNS_INVITATION_TOPIC_ARN || INACTIVITY_TOPIC_ARN;

// Helper to construct client with credentials if provided in env, else default chain
function getSnsClient(): SNSClient | null {
  if (USE_MOCK) {
    return null;
  }
  const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
      }
    : undefined;

  return new SNSClient({
    region: AWS_REGION,
    ...(credentials ? { credentials } : {})
  });
}

const snsClient: SNSClient | null = getSnsClient();

export type NotificationType =
  | 'INACTIVITY_WARNING'
  | 'OWNER_FLAGGED_INACTIVE'
  | 'GRACE_PERIOD_STARTED'
  | 'ACCESS_GRANTED'
  | 'INVITATION_SENT'
  | 'CHECK_IN_CONFIRMED';

export class NotificationService {
  /**
   * Checks the real-time AWS SNS subscription state for an email address.
   * AWS SNS returns SubscriptionArn: 'PendingConfirmation' until the recipient clicks the confirm link.
   */
  public static async checkSubscriptionStatus(
    recipientEmail: string,
    topicArn: string = INVITATION_TOPIC_ARN
  ): Promise<{ status: 'CONFIRMED' | 'PENDING_CONFIRMATION' | 'NOT_SUBSCRIBED'; subscriptionArn?: string }> {
    const normalizedEmail = recipientEmail.trim().toLowerCase();

    if (USE_MOCK || !snsClient || !topicArn) {
      return { status: 'CONFIRMED', subscriptionArn: 'mock-confirmed-arn' };
    }

    try {
      const command = new ListSubscriptionsByTopicCommand({ TopicArn: topicArn });
      const response = await snsClient.send(command);
      const subs = response.Subscriptions || [];

      const match = subs.find(s => s.Endpoint?.toLowerCase() === normalizedEmail);
      if (!match) {
        return { status: 'NOT_SUBSCRIBED' };
      }

      if (match.SubscriptionArn && match.SubscriptionArn.toLowerCase() !== 'pendingconfirmation') {
        return { status: 'CONFIRMED', subscriptionArn: match.SubscriptionArn };
      }

      return { status: 'PENDING_CONFIRMATION' };
    } catch (err: any) {
      console.warn(`[SNS:CheckStatus:Warning] Failed to list subscriptions for ${normalizedEmail}:`, err.message);
      return { status: 'NOT_SUBSCRIBED' };
    }
  }

  /**
   * Subscribes a nominee's email address to the SNS Topic so AWS SNS can deliver emails.
   */
  public static async subscribeNomineeToTopic(recipientEmail: string, topicArn: string): Promise<string | undefined> {
    const normalizedEmail = recipientEmail.trim().toLowerCase();
    if (USE_MOCK || !snsClient || !topicArn) {
      console.log(`[SNS:MOCK:SUBSCRIBE] Simulated SNS topic subscription for ${normalizedEmail}`);
      return 'mock-subscription-arn';
    }

    try {
      console.log(`[SNS:SUBSCRIBE:START] Subscribing nominee email "${normalizedEmail}" to SNS Topic "${topicArn}"...`);
      const command = new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: 'email',
        Endpoint: normalizedEmail,
        ReturnSubscriptionArn: true
      });

      const response = await snsClient.send(command);
      console.log(`[SNS:SUBSCRIBE:SUCCESS] AWS SNS acknowledged subscription for "${normalizedEmail}". Status: ${response.SubscriptionArn || 'Pending confirmation'}`);
      return response.SubscriptionArn;
    } catch (err: any) {
      console.error(`[SNS:SUBSCRIBE:ERROR] Failed to subscribe "${normalizedEmail}" to SNS Topic "${topicArn}":`, err.message);
      return undefined;
    }
  }

  /**
   * Publishes an audited notification via SNS and records it in RDS PostgreSQL and memory.
   */
  public static async sendNotification(params: {
    recipientEmail: string;
    recipientRole: 'OWNER' | 'NOMINEE';
    notificationType: NotificationType;
    ownerId: string;
    eventReferenceId?: string;
    subject: string;
    messageBody: string;
  }): Promise<{ id: string; deliveryStatus: string; providerMessageId?: string; error?: string; subscriptionStatus?: string }> {
    const notificationId = uuidv4();
    let deliveryStatus = 'CREATED';
    let providerMessageId: string | undefined;
    let errorMessage: string | undefined;
    let subscriptionStatus = 'CONFIRMED';

    const normalizedEmail = params.recipientEmail.trim().toLowerCase();

    // Determine target SNS topic
    let topicArn = INACTIVITY_TOPIC_ARN;
    if (params.notificationType === 'ACCESS_GRANTED') {
      topicArn = ACCESS_GRANTED_TOPIC_ARN;
    } else if (params.notificationType === 'INVITATION_SENT') {
      topicArn = INVITATION_TOPIC_ARN;
    }

    if (!USE_MOCK && snsClient && topicArn) {
      if (params.notificationType === 'INVITATION_SENT') {
        // Step 1: Subscribe nominee to SNS topic
        await this.subscribeNomineeToTopic(normalizedEmail, topicArn);

        // Step 2: Check whether subscription is already confirmed
        const sub = await this.checkSubscriptionStatus(normalizedEmail, topicArn);
        subscriptionStatus = sub.status;

        if (sub.status === 'PENDING_CONFIRMATION') {
          // AWS has sent confirmation email; topic messages cannot be delivered until nominee confirms
          deliveryStatus = 'PENDING_SNS_CONFIRMATION';
          console.log(`[SNS:INVITATION] Nominee "${normalizedEmail}" is PendingConfirmation. AWS dispatched the subscription verification email.`);
        } else {
          // Subscription confirmed: publish immediately!
          try {
            console.log(`[SNS:PUBLISH:START] Publishing confirmed invitation to "${normalizedEmail}"...`);
            const command = new PublishCommand({
              TopicArn: topicArn,
              Subject: `[VaultKeep Security] ${params.subject}`,
              Message: params.messageBody,
              MessageAttributes: {
                RecipientEmail: { DataType: 'String', StringValue: normalizedEmail },
                NotificationType: { DataType: 'String', StringValue: params.notificationType }
              }
            });
            const response = await snsClient.send(command);
            deliveryStatus = 'PUBLISHED';
            providerMessageId = response.MessageId;
            console.log(`[SNS:PUBLISH:SUCCESS] Invitation email dispatched to confirmed subscriber! MessageId: ${response.MessageId}`);
          } catch (err: any) {
            console.error(`[SNS:PUBLISH:FAILURE] Failed to publish message:`, err.message);
            deliveryStatus = 'FAILED';
            errorMessage = err.message;
          }
        }
      } else {
        // General notifications (Inactivity warning, Access granted)
        try {
          console.log(`[SNS:PUBLISH:START] Publishing "${params.notificationType}" to Topic "${topicArn}" for "${normalizedEmail}"...`);
          const command = new PublishCommand({
            TopicArn: topicArn,
            Subject: `[VaultKeep Security] ${params.subject}`,
            Message: params.messageBody,
            MessageAttributes: {
              RecipientEmail: { DataType: 'String', StringValue: normalizedEmail },
              NotificationType: { DataType: 'String', StringValue: params.notificationType }
            }
          });

          const response = await snsClient.send(command);
          deliveryStatus = 'PUBLISHED';
          providerMessageId = response.MessageId;
          console.log(`[SNS:PUBLISH:SUCCESS] Notification published! MessageId: ${response.MessageId}`);
        } catch (err: any) {
          console.error(`[SNS:PUBLISH:FAILURE] Failed to publish message:`, err.message);
          deliveryStatus = 'FAILED';
          errorMessage = err.message;
        }
      }
    } else {
      // Local Mock Provider
      console.log(`[SNS:MOCK:PUBLISH] Mock notification delivered to ${normalizedEmail} (Type: ${params.notificationType})`);
      deliveryStatus = 'PROVIDER_ACCEPTED';
      providerMessageId = `mock-sns-${uuidv4()}`;
    }

    const now = new Date();
    const record = {
      id: notificationId,
      recipient_email: normalizedEmail,
      recipient_role: params.recipientRole,
      notification_type: params.notificationType,
      owner_id: params.ownerId,
      event_reference_id: params.eventReferenceId || null,
      delivery_status: deliveryStatus,
      provider_message_id: providerMessageId || null,
      error_message: errorMessage || null,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    // 1. Persist to Amazon RDS PostgreSQL
    try {
      await query(
        `INSERT INTO notifications (id, recipient_email, recipient_role, notification_type, owner_id, event_reference_id, delivery_status, provider_message_id, error_message, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [notificationId, normalizedEmail, params.recipientRole, params.notificationType, params.ownerId, params.eventReferenceId || null, deliveryStatus, providerMessageId || null, errorMessage || null, now, now]
      );
    } catch (err: any) {
      console.error('[NotificationService:DB:Error] Failed to insert into RDS notifications table:', err.message);
    }

    return {
      id: notificationId,
      deliveryStatus,
      providerMessageId,
      error: errorMessage,
      subscriptionStatus
    };
  }

  /**
   * Checks if an unconfirmed nominee has confirmed their AWS email subscription,
   * and if confirmed, publishes the pending invitation email.
   */
  public static async checkAndDeliverPendingInvitation(
    recipientEmail: string,
    ownerId: string,
    subject: string,
    messageBody: string,
    eventReferenceId?: string
  ): Promise<{ delivered: boolean; status: string; message: string; messageId?: string }> {
    const normalizedEmail = recipientEmail.trim().toLowerCase();
    const topicArn = INVITATION_TOPIC_ARN;

    const sub = await this.checkSubscriptionStatus(normalizedEmail, topicArn);
    if (sub.status === 'CONFIRMED') {
      if (snsClient && !USE_MOCK) {
        try {
          const command = new PublishCommand({
            TopicArn: topicArn,
            Subject: `[VaultKeep Security] ${subject}`,
            Message: messageBody,
            MessageAttributes: {
              RecipientEmail: { DataType: 'String', StringValue: normalizedEmail },
              NotificationType: { DataType: 'String', StringValue: 'INVITATION_SENT' }
            }
          });
          const response = await snsClient.send(command);

          // Update notifications table in RDS
          await query(
            `UPDATE notifications
             SET delivery_status = 'PUBLISHED', provider_message_id = $1, updated_at = NOW()
             WHERE LOWER(recipient_email) = LOWER($2) AND notification_type = 'INVITATION_SENT'`,
            [response.MessageId, normalizedEmail]
          );

          return {
            delivered: true,
            status: 'PUBLISHED',
            message: 'AWS SNS subscription is confirmed. Invitation email dispatched successfully!',
            messageId: response.MessageId
          };
        } catch (err: any) {
          return { delivered: false, status: 'FAILED', message: err.message };
        }
      }
      return { delivered: true, status: 'PUBLISHED', message: 'Invitation published.' };
    }

    return {
      delivered: false,
      status: 'PENDING_CONFIRMATION',
      message: 'AWS email subscription is still pending confirmation. The nominee must click "Confirm subscription" in the email sent by AWS.'
    };
  }

  public static async getNotificationsForUser(email: string, ownerId?: string) {
    const res = await query(
      `SELECT * FROM notifications
       WHERE LOWER(recipient_email) = LOWER($1) OR ($2::uuid IS NOT NULL AND owner_id = $2)
       ORDER BY created_at DESC`,
      [email, ownerId || null]
    );
    return res.rows || [];
  }
}
