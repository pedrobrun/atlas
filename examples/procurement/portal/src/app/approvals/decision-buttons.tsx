'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DecisionButtons({ stepId }: { stepId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && comment.trim().length === 0) {
      setError('Add a comment so the requester knows why.');
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/approvals/${stepId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? 'The decision could not be recorded.');
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        placeholder="Comment (required to reject)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button disabled={busy} onClick={() => decide('approve')}>
        Approve
      </button>
      <button disabled={busy} onClick={() => decide('reject')}>
        Reject
      </button>
      {error && (
        <p role="alert" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}
    </div>
  );
}
