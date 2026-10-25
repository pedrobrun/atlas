import type { ApproverRole } from '@northwind/contracts';
import type { Db } from '@/db/pool';
import type { ApproverDirectory, ChainContext } from './chain-builder';

export function dbDirectory(db: Db): ApproverDirectory {
  async function managerOf(userId: string): Promise<string | null> {
    const { rows } = await db.query<{ manager_id: string | null }>(
      `SELECT m.id AS manager_id FROM users u JOIN users m ON m.id = u.manager_id AND m.active WHERE u.id = $1`,
      [userId],
    );
    return rows[0]?.manager_id ?? null;
  }

  async function resolve(role: ApproverRole, ctx: ChainContext): Promise<string | null> {
    if (role === 'manager') return managerOf(ctx.requesterId);
    if (role === 'cost_center_owner') {
      const { rows } = await db.query<{ owner_id: string | null }>(
        `SELECT c.owner_id FROM cost_centers c JOIN users u ON u.id = c.owner_id AND u.active WHERE c.id = $1`,
        [ctx.costCenterId],
      );
      return rows[0]?.owner_id ?? null;
    }
    // A cost-center-specific assignment beats the company-wide one.
    const { rows } = await db.query<{ user_id: string }>(
      `SELECT a.user_id FROM approver_assignments a JOIN users u ON u.id = a.user_id AND u.active
        WHERE a.approver_role = $1 AND (a.cost_center_id = $2 OR a.cost_center_id IS NULL)
        ORDER BY a.cost_center_id NULLS LAST LIMIT 1`,
      [role, ctx.costCenterId],
    );
    return rows[0]?.user_id ?? null;
  }

  return { resolve, managerOf };
}
