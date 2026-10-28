import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { v4 as uuidv4 } from 'uuid';
import { memoryDb, query } from '../db';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const USE_MOCK = process.env.AWS_MOCK_SERVICES === 'true';
const INACTIVITY_TOPIC_ARN = process.env.SNS_INACTIVITY_TOPIC_ARN;
const ACCESS_GRANTED_TOPIC_ARN = process.env.SNS_ACCESS_GRANTED_TOPIC_ARN;

let snsClient: SNSClient | null = null;
if (!USE_MOCK) {
  snsClient = new SNSClient({ region: AWS_REGION });
}

export type NotificationType =
  | 'INACTIVITY_WARNING'
  | 'OWNER_FLAGGED_INACTIVE'
  | 'GRACE_PERIOD_STARTED'
  | 'ACCESS_GRANTED'
  | 'INVITATION_SENT'
  | 'CHECK_IN_CONFIRMED';

export class NotificationService {
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
  }): Promise<{ id: string; deliveryStatus: string; providerMessageId?: string }> {
    const notificationId = uuidv4();
    let deliveryStatus = 'CREATED';
    let providerMessageId: string | undefined;
    let errorMessage: string | undefined;

    const topicArn =
      params.notificationType === 'ACCESS_GRANTED'
        ? ACCESS_GRANTED_TOPIC_ARN
        : INACTIVITY_TOPIC_ARN;

    if (!USE_MOCK && snsClient && topicArn) {
      try {
        const command = new PublishCommand({
          TopicArn: topicArn,
          Subject: `[VaultKeep Security] ${params.subject}`,
          Message: `${params.messageBody}\n\nNotice: This is an automated security notice from VaultKeep. No sensitive document plaintext or passwords are ever transmitted via notification.`,
          MessageAttributes: {
            RecipientEmail: { DataType: 'String', StringValue: params.recipientEmail },
            NotificationType: { DataType: 'String', StringValue: params.notificationType }
          }
        });
        const response = await snsClient.send(command);
        deliveryStatus = 'PUBLISHED';
        providerMessageId = response.MessageId;
      } catch (err: any) {
        console.warn(`[SNS Publish] Failed, logging as local mock: ${err.message}`);
        deliveryStatus = 'FAILED';
        errorMessage = err.message;
      }
    } else {
      // Local Mock Provider: Simulates instantaneous provider delivery
      deliveryStatus = 'PROVIDER_ACCEPTED';
      providerMessageId = `mock-sns-${uuidv4()}`;
    }

    const record = {
      id: notificationId,
      recipient_email: params.recipientEmail,
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
      providerMessageId
    };
  }

  public static async getNotificationsForUser(email: string, ownerId?: string) {
    return memoryDb.notifications.filter(
      n => n.recipient_email.toLowerCase() === email.toLowerCase() || (ownerId && n.owner_id === ownerId)
    );
  }
}
