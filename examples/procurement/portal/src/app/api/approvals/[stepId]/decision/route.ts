import { ApprovalDecisionSchema } from '@northwind/contracts';
import { bff } from '@/lib/bff';
import { procureApi } from '@/lib/procure-api';

export const POST = bff<{ stepId: string }>(
  async (request, session, { stepId }) => {
    const decision = ApprovalDecisionSchema.parse(await request.json());
    return procureApi(session, `/approvals/steps/${encodeURIComponent(stepId)}/decision`, {
      method: 'POST',
      body: decision,
    });
  },
  ['approver'],
);
