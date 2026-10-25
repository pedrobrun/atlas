import { migrate } from '@/db/migrate';
import { pool } from '@/db/pool';
import { buildServer } from '@/http/server';
import { startPaymentScheduler } from '@/jobs/payment-scheduler';
import { startEventConsumer } from '@/queue/sqs-consumer';

await migrate();
const app = buildServer();
const stopConsumer = startEventConsumer();
const stopScheduler = startPaymentScheduler();
await app.listen({ port: Number(process.env.PORT ?? 4100), host: '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    stopScheduler();
    await stopConsumer();
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
