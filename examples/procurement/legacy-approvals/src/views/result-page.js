'use strict';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(title, body) {
  const portal = escapeHtml(process.env.PORTAL_BASE_URL || '');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)} - Northwind Procurement</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px}button{padding:8px 16px}</style>
</head><body><h1>${escapeHtml(title)}</h1>${body}
<p><small>This page is being retired. You can also decide in the <a href="${portal}/approvals">procurement portal</a>.</small></p>
</body></html>`;
}

function confirmPage(token, decision) {
  const verb = decision === 'approve' ? 'Approve' : 'Reject';
  const comment =
    decision === 'reject'
      ? `<p><label>Reason (required)<br><textarea name="comment" required rows="4" cols="50"></textarea></label></p>`
      : `<p><label>Comment (optional)<br><textarea name="comment" rows="2" cols="50"></textarea></label></p>`;
  return layout(
    `${verb} this request?`,
    `<form method="post" action="/approve/${escapeHtml(token)}">${comment}<button type="submit">${verb}</button></form>`,
  );
}

function resultPage(title, message) {
  return layout(title, `<p>${escapeHtml(message)}</p>`);
}

module.exports = { confirmPage, resultPage };
