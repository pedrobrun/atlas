import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  // Explicit keys for local runs; in ECS the task role supplies credentials.
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '' }
    : undefined,
});

export interface OutboxMessage {
  eventId: string;
  eventType: string;
  groupId: string;
  body: unknown;
}

export async function publishToSqs(message: OutboxMessage): Promise<string> {
  const queueUrl = process.env.PROCUREMENT_EVENTS_QUEUE_URL;
  if (!queueUrl) throw new Error('PROCUREMENT_EVENTS_QUEUE_URL is not set');
  const result = await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message.body),
      MessageGroupId: message.groupId,
      MessageDeduplicationId: message.eventId,
      MessageAttributes: { eventType: { DataType: 'String', StringValue: message.eventType } },
    }),
  );
  return result.MessageId ?? '';
}
