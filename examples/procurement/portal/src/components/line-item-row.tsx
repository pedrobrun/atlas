'use client';

import { formatMoney, multiplyCents, parseDecimalToCents, type Currency } from '@northwind/contracts';

export interface DraftLine {
  description: string;
  categoryCode: string;
  quantity: number;
  unitPrice: string;
}

const CATEGORIES = [
  'it-hardware',
  'software',
  'cloud-services',
  'office-supplies',
  'professional-services',
  'safety-equipment',
];

export const emptyLine = (): DraftLine => ({
  description: '',
  categoryCode: 'it-hardware',
  quantity: 1,
  unitPrice: '',
});

export function lineCents(line: DraftLine): number | null {
  try {
    return multiplyCents(parseDecimalToCents(line.unitPrice), line.quantity);
  } catch {
    return null;
  }
}

interface RowProps {
  line: DraftLine;
  currency: Currency;
  canRemove: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}

export function LineItemRow({ line, currency, canRemove, onChange, onRemove }: RowProps) {
  const cents = lineCents(line);
  return (
    <tr>
      <td>
        <input
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          required
        />
      </td>
      <td>
        <select value={line.categoryCode} onChange={(e) => onChange({ categoryCode: e.target.value })}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="number"
          min={1}
          step={1}
          value={line.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) })}
        />
      </td>
      <td>
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={line.unitPrice}
          onChange={(e) => onChange({ unitPrice: e.target.value })}
        />
      </td>
      <td>{cents === null ? 'invalid' : formatMoney(cents, currency)}</td>
      <td>
        <button type="button" onClick={onRemove} disabled={!canRemove}>
          Remove
        </button>
      </td>
    </tr>
  );
}
