'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ExceptionActions({ exceptionId }: { exceptionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function resolve(resolution: 'accept_variance' | 'reject_invoice') {
    if (note.trim().length < 3) {
      setError('A note is required for the audit trail.');
      return;
    }
    const response = await fetch(`/api/invoices/exceptions/${exceptionId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolution, note }),
    });
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).message ?? 'Could not resolve the exception.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <input placeholder="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} />
      <button onClick={() => resolve('accept_variance')}>Accept</button>
      <button onClick={() => resolve('reject_invoice')}>Reject</button>
      {error && (
        <span role="alert" style={{ color: '#dc2626' }}>
          {error}
        </span>
      )}
    </div>
  );
}
