const TONES: Record<string, string> = {
  draft: '#6b7280',
  submitted: '#2563eb',
  pending: '#2563eb',
  approved: '#16a34a',
  ordered: '#0d9488',
  issued: '#0d9488',
  amended: '#0d9488',
  matched: '#16a34a',
  paid: '#15803d',
  rejected: '#dc2626',
  withdrawn: '#6b7280',
  cancelled: '#6b7280',
  exception: '#d97706',
};

export function StatusBadge({ status }: { status: string }) {
  const color = TONES[status] ?? '#6b7280';
  return (
    <span
      style={{
        color,
        border: `1px solid ${color}`,
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 12,
        textTransform: 'capitalize',
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
