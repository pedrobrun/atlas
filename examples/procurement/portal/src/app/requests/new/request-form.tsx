'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { parseDecimalToCents, type Currency } from '@northwind/contracts';
import { LineItemsEditor, type DraftLine } from '@/components/line-items-editor';

interface Option {
  id: string;
  label: string;
}

export function RequestForm({
  costCenters,
  vendors,
}: {
  costCenters: (Option & { currency: Currency })[];
  vendors: Option[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [costCenterId, setCostCenterId] = useState(costCenters[0]?.id ?? '');
  const [vendorId, setVendorId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { description: '', categoryCode: 'it-hardware', quantity: 1, unitPrice: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currency = costCenters.find((c) => c.id === costCenterId)?.currency ?? 'USD';

  async function submit(event: FormEvent, sendForApproval: boolean) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        title,
        justification,
        costCenterId,
        vendorId: vendorId || null,
        currency,
        lineItems: lines.map((l) => ({
          description: l.description,
          categoryCode: l.categoryCode,
          quantity: l.quantity,
          unitPriceCents: parseDecimalToCents(l.unitPrice),
        })),
      };
      const created = await fetch('/api/requisitions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!created.ok) throw new Error((await created.json()).message ?? 'could not save the request');
      const { id } = (await created.json()) as { id: string };
      if (sendForApproval) {
        const submitted = await fetch(`/api/requisitions/${id}/submit`, { method: 'POST' });
        if (!submitted.ok)
          throw new Error((await submitted.json()).message ?? 'saved as draft, but submission failed');
      }
      router.push(`/requests?highlight=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => submit(e, true)}>
      <label>
        Title <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      </label>
      <label>
        Why is this needed?{' '}
        <textarea value={justification} onChange={(e) => setJustification(e.target.value)} />
      </label>
      <label>
        Cost center
        <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
          {costCenters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Vendor (optional, a buyer can choose later)
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Let procurement choose</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <LineItemsEditor lines={lines} currency={currency} onChange={setLines} />
      {error && (
        <p role="alert" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={(e) => submit(e, false)}>
        Save draft
      </button>
      <button type="submit" disabled={busy}>
        Submit for approval
      </button>
    </form>
  );
}
