import type { PoolClient } from 'pg';

// Employee <-> login links: users.employee_id (UNIQUE, so one login per employee and one employee per login).
// An employee record and a staff login with the same email (citext: case-insensitive; both columns are
// unique) belong to the same person, so they are linked automatically, but only when both sides are free:
// never a client user, never an inactive employee, and an existing link is never moved or overwritten.
// Admins link and unlink by hand in Employees and Settings > Users (routes/users.ts).

// Links the unlinked staff login whose email is this employee's work email. Returns the user id, or null
// when there is nothing to link. Call inside the transaction that wrote the employee.
export async function linkLoginByEmail(client: PoolClient, employeeId: string): Promise<string | null> {
  const linked = await client.query<{ id: string }>(
    `UPDATE users u SET employee_id = e.id
       FROM employees e
      WHERE e.id = $1 AND e.status <> 'inactive'
        AND u.email = e.work_email AND u.role <> 'client' AND u.employee_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM users o WHERE o.employee_id = e.id)
      RETURNING u.id`,
    [employeeId],
  );
  return linked.rows[0]?.id ?? null;
}

// The free, not inactive employee whose work email is this (staff) login's email, for a new user created
// without an explicit employee. Locked FOR SHARE like assertEmployeeLinkable.
export async function employeeForEmail(client: PoolClient, email: string): Promise<string | null> {
  const found = await client.query<{ id: string }>(
    `SELECT e.id FROM employees e
      WHERE e.work_email = $1 AND e.status <> 'inactive'
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)
      FOR SHARE OF e`,
    [email],
  );
  return found.rows[0]?.id ?? null;
}

export interface LinkPlanRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  userId: string;
  email: string;
  role: string;
  action: 'link' | 'skip';
  reason: string | null; // why a pair is skipped
}

// Every employee/login pair sharing an email that is not linked to each other yet, with what would happen.
// Used by `npm run link-by-email` (dry run by default).
export async function linkPlan(client: Pick<PoolClient, 'query'>): Promise<LinkPlanRow[]> {
  const { rows } = await client.query<Omit<LinkPlanRow, 'action' | 'reason'> & {
    employeeStatus: string;
    userEmployeeId: string | null;
    employeeLinkedTo: string | null;
  }>(
    `SELECT e.id AS "employeeId", e.employee_code AS "employeeCode", e.full_name AS "employeeName", e.status AS "employeeStatus",
            u.id AS "userId", u.email::text AS email, u.role, u.employee_id AS "userEmployeeId",
            (SELECT o.email::text FROM users o WHERE o.employee_id = e.id) AS "employeeLinkedTo"
       FROM employees e
       JOIN users u ON u.email = e.work_email
      WHERE u.employee_id IS DISTINCT FROM e.id
      ORDER BY e.employee_code`,
  );
  return rows.map(({ employeeStatus, userEmployeeId, employeeLinkedTo, ...pair }) => {
    const reason =
      pair.role === 'client'
        ? 'login is a client user'
        : employeeStatus === 'inactive'
          ? 'employee is inactive'
          : userEmployeeId
            ? 'login is already linked to another employee'
            : employeeLinkedTo
              ? `employee is already linked to ${employeeLinkedTo}`
              : null;
    return { ...pair, action: reason ? 'skip' : 'link', reason };
  });
}
