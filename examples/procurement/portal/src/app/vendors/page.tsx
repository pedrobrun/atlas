import { StatusBadge } from '@/components/status-badge';
import { procureApi } from '@/lib/procure-api';
import { requirePageSession } from '@/lib/session';

interface VendorRow {
  id: string;
  legalName: string;
  country: string;
  categories: string[];
  status: string;
  riskLevel: string | null;
}

export default async function VendorDirectoryPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = requirePageSession();
  const query = searchParams.q?.trim();
  const vendors = await procureApi<VendorRow[]>(
    session,
    `/vendors${query ? `?q=${encodeURIComponent(query)}` : ''}`,
  );

  return (
    <section>
      <h1>Vendor directory</h1>
      <form>
        <input name="q" defaultValue={query} placeholder="Search by name" />
        <button type="submit">Search</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Country</th>
            <th>Categories</th>
            <th>Risk</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id}>
              <td>{v.legalName}</td>
              <td>{v.country}</td>
              <td>{v.categories.join(', ')}</td>
              <td>{v.riskLevel ?? 'not assessed'}</td>
              <td>
                <StatusBadge status={v.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
