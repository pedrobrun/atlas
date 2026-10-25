import sgMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) sgMail.setApiKey(apiKey);

const FROM = process.env.EMAIL_FROM ?? 'procurement@northwind-supply.example';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface ApprovalEmail {
  to: string;
  requisitionNumber: string;
  title: string;
  requesterName: string;
  amountLabel: string;
  approveUrl: string;
  rejectUrl: string;
  portalUrl: string;
}

export async function sendApprovalEmail(mail: ApprovalEmail): Promise<void> {
  if (!apiKey) throw new Error('SENDGRID_API_KEY is not set');
  const title = escapeHtml(mail.title);
  await sgMail.send({
    to: mail.to,
    from: FROM,
    subject: `Approval needed: ${mail.requisitionNumber} ${mail.title} (${mail.amountLabel})`,
    text: `${mail.requesterName} requested ${mail.amountLabel} for "${mail.title}".\n\nApprove: ${mail.approveUrl}\nReject: ${mail.rejectUrl}\nDetails: ${mail.portalUrl}`,
    html: `<p>${escapeHtml(mail.requesterName)} requested <strong>${escapeHtml(mail.amountLabel)}</strong> for "${title}".</p>
<p><a href="${mail.approveUrl}">Approve</a> &middot; <a href="${mail.rejectUrl}">Reject</a> &middot; <a href="${mail.portalUrl}">Open in portal</a></p>`,
    categories: ['approval-request'],
  });
}

export async function sendStatusEmail(to: string, subject: string, body: string): Promise<void> {
  if (!apiKey) throw new Error('SENDGRID_API_KEY is not set');
  await sgMail.send({ to, from: FROM, subject, text: body, categories: ['requisition-status'] });
}
