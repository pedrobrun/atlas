import Fastify from 'fastify';
import { approvalRoutes } from '@/approvals/approval.routes';
import { auditRoutes } from '@/audit/audit.routes';
import { budgetRoutes } from '@/budgets/budget.routes';
import { catalogRoutes } from '@/catalog/catalog.routes';
import { contractRoutes, docusignWebhookRoutes } from '@/contracts/contract.routes';
import { authenticate } from '@/http/auth';
import { errorHandler } from '@/http/error-handler';
import { internalRoutes } from '@/internal/internal.routes';
import { purchaseOrderRoutes } from '@/purchase-orders/po.routes';
import { requisitionRoutes } from '@/requisitions/requisition.routes';
import { vendorRoutes } from '@/vendors/vendor.routes';

export function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // Vendor contract PDFs arrive base64-encoded in the JSON body.
    bodyLimit: 15 * 1024 * 1024,
  });

  app.decorateRequest('actor', null);
  app.setErrorHandler(errorHandler);
  app.get('/healthz', async () => ({ ok: true }));

  app.register(docusignWebhookRoutes);

  app.register(async (api) => {
    api.addHook('preHandler', authenticate);
    await api.register(requisitionRoutes);
    await api.register(approvalRoutes);
    await api.register(budgetRoutes);
    await api.register(vendorRoutes);
    await api.register(purchaseOrderRoutes);
    await api.register(contractRoutes);
    await api.register(catalogRoutes);
    await api.register(auditRoutes);
    await api.register(internalRoutes);
  });

  return app;
}
