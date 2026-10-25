'use strict';

const axios = require('axios');

const client = axios.create({
  baseURL: process.env.PROCURE_API_URL,
  timeout: 10000,
  headers: {
    authorization: `Bearer ${process.env.PROCURE_SERVICE_TOKEN}`,
    'x-northwind-caller': 'legacy-approvals',
  },
  validateStatus: () => true,
});

function userHeader(approverId) {
  return Buffer.from(JSON.stringify({ id: approverId, email: null, roles: ['approver'] })).toString(
    'base64url',
  );
}

async function submitDecision(stepId, approverId, decision, comment) {
  const response = await client.post(
    `/approvals/steps/${encodeURIComponent(stepId)}/decision`,
    { decision, comment: comment || undefined },
    { headers: { 'x-northwind-user': userHeader(approverId) } },
  );
  if (response.status >= 200 && response.status < 300) return { ok: true, outcome: response.data };
  return {
    ok: false,
    status: response.status,
    message: (response.data && response.data.message) || 'request failed',
  };
}

module.exports = { submitDecision };
