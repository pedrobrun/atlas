'use strict';

const express = require('express');
const { verifyLinkToken } = require('../lib/link-token');
const { submitDecision } = require('../lib/procure-client');
const { confirmPage, resultPage } = require('../views/result-page');

const router = express.Router();

const REASONS = {
  expired: 'This link has expired. Open the request in the procurement portal instead.',
  bad_signature: 'This link is not valid.',
  malformed: 'This link is not valid.',
};

// GET only renders a confirmation: corporate mail scanners prefetch every link in an email,
// and acting on GET once approved requests nobody had looked at.
router.get('/:token', (req, res) => {
  const claims = verifyLinkToken(req.params.token);
  if (!claims.ok) return res.status(400).send(resultPage('Link not valid', REASONS[claims.reason]));
  res.set('Cache-Control', 'no-store').send(confirmPage(req.params.token, claims.decision));
});

router.post('/:token', async (req, res, next) => {
  try {
    const claims = verifyLinkToken(req.params.token);
    if (!claims.ok) return res.status(400).send(resultPage('Link not valid', REASONS[claims.reason]));

    const comment = (req.body.comment || '').trim();
    if (claims.decision === 'reject' && !comment) {
      return res.status(400).send(confirmPage(req.params.token, claims.decision));
    }

    const result = await submitDecision(claims.stepId, claims.approverId, claims.decision, comment);
    if (result.ok) {
      const done = claims.decision === 'approve' ? 'Approved' : 'Rejected';
      return res.send(resultPage(done, 'Thanks, your decision has been recorded.'));
    }
    if (result.status === 409) {
      return res
        .status(409)
        .send(resultPage('Already decided', 'This step was already decided or withdrawn.'));
    }
    if (result.status === 403) {
      return res.status(403).send(resultPage('Not allowed', 'You are no longer the approver for this step.'));
    }
    console.error('procure-api rejected link decision', {
      stepId: claims.stepId,
      status: result.status,
      message: result.message,
    });
    return res
      .status(502)
      .send(resultPage('Could not record decision', 'Please try again from the procurement portal.'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
