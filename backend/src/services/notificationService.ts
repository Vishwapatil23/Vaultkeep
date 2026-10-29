import { SNSClient, PublishCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { memoryDb } from '../db';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USE_MOCK = process.env.AWS_MOCK_SERVICES === 'true';
const INACTIVITY_TOPIC_ARN = process.env.SNS_INACTIVITY_TOPIC_ARN;
const ACCESS_GRANTED_TOPIC_ARN = process.env.SNS_ACCESS_GRANTED_TOPIC_ARN;
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
   * Subscribes a nominee's email address to the SNS Topic so AWS SNS can deliver emails.
   * Configures a message attribute filter policy so this recipient only receives emails directed to them.
   */
  public static async subscribeNomineeToTopic(recipientEmail: string, topicArn: string): Promise<string | undefined> {
    const normalizedEmail = recipientEmail.trim().toLowerCase();
    if (USE_MOCK || !snsClient || !topicArn) {
      console.log(`[SNS:MOCK:SUBSCRIBE] Simulated SNS topic subscription for ${normalizedEmail} on ${topicArn || 'local-mock-topic'}`);
      return 'mock-subscription-arn';
    }

    try {
      console.log(`[SNS:SUBSCRIBE:START] Subscribing nominee email "${normalizedEmail}" to SNS Topic "${topicArn}"...`);
      const command = new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: 'email',
        Endpoint: normalizedEmail,
        ReturnSubscriptionArn: true,
        Attributes: {
          FilterPolicy: JSON.stringify({
            RecipientEmail: [normalizedEmail]
          }),
          FilterPolicyScope: 'MessageAttributes'
        }
      });

      const response = await snsClient.send(command);
      console.log(`[SNS:SUBSCRIBE:SUCCESS] Subscription request acknowledged by AWS SNS for "${normalizedEmail}". Status: ${response.SubscriptionArn || 'Pending confirmation email dispatch'}`);
      return response.SubscriptionArn;
    } catch (err: any) {
      console.error(`[SNS:SUBSCRIBE:ERROR] Failed to subscribe "${normalizedEmail}" to SNS Topic "${topicArn}":`, err.message);
      // We log but do not crash so publishing can still be attempted
      return undefined;
    }
  }

  /**
   * Publishes an audited notification via SNS and records it in the database.
   */
  public static async sendNotification(params: {
    recipientEmail: string;
    recipientRole: 'OWNER' | 'NOMINEE';
    notificationType: NotificationType;
    ownerId: string;
    eventReferenceId?: string;
    subject: string;
    messageBody: string;
  }): Promise<{ id: string; deliveryStatus: string; providerMessageId?: string; error?: string }> {
    const notificationId = uuidv4();
    let deliveryStatus = 'CREATED';
    let providerMessageId: string | undefined;
    let errorMessage: string | undefined;

    const normalizedEmail = params.recipientEmail.trim().toLowerCase();

    // Determine target SNS topic
    let topicArn = INACTIVITY_TOPIC_ARN;
    if (params.notificationType === 'ACCESS_GRANTED') {
      topicArn = ACCESS_GRANTED_TOPIC_ARN;
    } else if (params.notificationType === 'INVITATION_SENT') {
      topicArn = INVITATION_TOPIC_ARN;
    }

    // Step 1: For invitations, initiate SNS subscription with filter policy
    if (params.notificationType === 'INVITATION_SENT' && topicArn) {
      await this.subscribeNomineeToTopic(normalizedEmail, topicArn);
    }

    // Step 2: Publish notification to AWS SNS
    if (!USE_MOCK && snsClient && topicArn) {
      try {
        console.log(`[SNS:PUBLISH:START] Publishing notification "${params.notificationType}" to Topic "${topicArn}" for recipient "${normalizedEmail}"...`);
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
        console.log(`[SNS:PUBLISH:SUCCESS] Notification published successfully to AWS SNS! MessageId: ${response.MessageId}, Recipient: "${normalizedEmail}"`);
      } catch (err: any) {
        console.error(`[SNS:PUBLISH:FAILURE] Failed to publish message via AWS SNS to "${normalizedEmail}":`, err.message);
        deliveryStatus = 'FAILED';
        errorMessage = err.message;
      }
    } else {
      // Local Mock Provider: Simulates instantaneous provider delivery
      console.log(`[SNS:MOCK:PUBLISH] Mock notification delivered to ${normalizedEmail} (Type: ${params.notificationType})`);
      deliveryStatus = 'PROVIDER_ACCEPTED';
      providerMessageId = `mock-sns-${uuidv4()}`;
    }

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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Record in database / memoryDb
    memoryDb.notifications.unshift(record);

    return {
      id: notificationId,
      deliveryStatus,
      providerMessageId,
      error: errorMessage
    };
  }

  public static async getNotificationsForUser(email: string, ownerId?: string) {
    return memoryDb.notifications.filter(
      n => n.recipient_email.toLowerCase() === email.toLowerCase() || (ownerId && n.owner_id === ownerId)
    );
  }
}

