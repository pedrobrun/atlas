import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient, type Message } from '@aws-sdk/client-sqs';
import { ProcurementEventSchema } from '@northwind/contracts';
import { handleProcurementEvent } from './event-handlers';

const sqs = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '' }
    : undefined,
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function queueUrl(): string {
  const url = process.env.PROCUREMENT_EVENTS_QUEUE_URL;
  if (!url) throw new Error('PROCUREMENT_EVENTS_QUEUE_URL is not set');
  return url;
}

async function processMessage(message: Message): Promise<void> {
  let body: unknown;
  try {
    body = JSON.parse(message.Body ?? '');
  } catch {
    body = null;
  }
  const parsed = ProcurementEventSchema.safeParse(body);
  if (!parsed.success) {
    // Not deleted: after maxReceiveCount the redrive policy moves it to the DLQ for a human.
    console.error('unparseable procurement event', {
      messageId: message.MessageId,
      issues: parsed.error.issues,
    });
    return;
  }
  await handleProcurementEvent(parsed.data);
  await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl(), ReceiptHandle: message.ReceiptHandle }));
}

export function startEventConsumer(): () => Promise<void> {
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        const { Messages = [] } = await sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl(),
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
            VisibilityTimeout: 120,
          }),
        );
        for (const message of Messages) {
          try {
            await processMessage(message);
          } catch (err) {
            // FIFO: the rest of this batch may belong to the same group, so stop and let it redeliver.
            console.error('procurement event handler failed', { messageId: message.MessageId, err });
            break;
          }
        }
      } catch (err) {
        console.error('SQS receive failed', err);
        await delay(5_000);
      }
    }
  })();
  return async () => {
    stopped = true;
    await loop;
  };
}
