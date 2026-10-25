import type { ReactNode } from 'react';
import Link from 'next/link';
import { hasAnyRole, readSession } from '@/lib/session';

export const metadata = { title: 'Northwind Procurement' };

export default function RootLayout({ children }: { children: ReactNode }) {
  const session = readSession();
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <header style={{ display: 'flex', gap: 16, padding: '12px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <strong>Northwind Procurement</strong>
          <Link href="/requests">My requests</Link>
          <Link href="/requests/new">New request</Link>
          {session && hasAnyRole(session, ['approver']) && <Link href="/approvals">Approvals</Link>}
          <Link href="/vendors">Vendors</Link>
          {session && hasAnyRole(session, ['finance']) && <Link href="/invoices">Invoices</Link>}
          {session && hasAnyRole(session, ['finance', 'approver']) && <Link href="/budgets">Budgets</Link>}
          <span style={{ marginLeft: 'auto' }}>{session?.name}</span>
        </header>
        <main style={{ padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
