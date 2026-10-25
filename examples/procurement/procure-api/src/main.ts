import { startSlaEscalationJob } from '@/approvals/sla-escalation.job';
import { migrate } from '@/db/migrate';
import { pool } from '@/db/pool';
import { startOutboxRelay } from '@/queue/outbox-relay.job';
import { buildServer } from './server';

const app = buildServer();
const applied = await migrate();
if (applied.length > 0) app.log.info({ applied }, 'migrations applied');

const stopJobs = [startOutboxRelay(), startSlaEscalationJob()];
await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    stopJobs.forEach((stop) => stop());
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
