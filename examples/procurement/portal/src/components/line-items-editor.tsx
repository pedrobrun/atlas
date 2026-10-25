'use client';

import { formatMoney, sumCents, type Currency } from '@northwind/contracts';
import { emptyLine, lineCents, LineItemRow, type DraftLine } from './line-item-row';

export type { DraftLine };

interface EditorProps {
  lines: DraftLine[];
  currency: Currency;
  onChange: (lines: DraftLine[]) => void;
}

export function LineItemsEditor({ lines, currency, onChange }: EditorProps) {
  const update = (index: number, patch: Partial<DraftLine>) =>
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const totals = lines.map(lineCents);
  const total = totals.every((t): t is number => t !== null) ? sumCents(totals) : null;

  return (
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Category</th>
          <th>Qty</th>
          <th>Unit price</th>
          <th>Line total</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lines.map((line, i) => (
          <LineItemRow
            key={i}
            line={line}
            currency={currency}
            canRemove={lines.length > 1}
            onChange={(patch) => update(i, patch)}
            onRemove={() => onChange(lines.filter((_, j) => j !== i))}
          />
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>
            <button type="button" onClick={() => onChange([...lines, emptyLine()])}>
              Add line
            </button>
          </td>
          <td>
            <strong>{total === null ? 'invalid' : formatMoney(total, currency)}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
