'use strict';

const express = require('express');
const approveByLink = require('./routes/approve-by-link');

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use('/approve', approveByLink);

app.use((err, req, res, next) => {
  console.error('unhandled error', err);
  res.status(500).send('Something went wrong. Please use the procurement portal instead.');
});

const port = Number(process.env.PORT || 3100);
app.listen(port, () => {
  console.log(`legacy-approvals listening on ${port}`);
});
