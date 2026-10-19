// Read-only account check: every login with its role, status, linked employee and last login, plus flags.
//
//   npm run check-accounts
//   npm run check-accounts -- --plan "alice=admin,bob=manager"     (or ROLE_PLAN="alice=admin,bob=manager")
//
// A plan entry names a login by its full email or by the part before the @ (case-insensitive). Flags:
//   - a planned person whose login has a different role, or who has no login at all;
//   - an admin or manager login that is not in the plan (only when a plan is given);
//   - a client login without a client company, or whose company is inactive;
//   - an employee login without an employee record (no attendance, no payslips);
//   - an employee record (active or on leave) without any login ("No login" on the Employees page).
// It only SELECTs: nothing is written, and no password hashes, tokens or secrets are read or printed.
// Run it against production only from your own machine with the production DATABASE_URL in your shell.
import { pool } from '../db.js';

const ROLES = ['admin', 'manager', 'employee', 'client'] as const;
type Role = (typeof ROLES)[number];

function parsePlan(raw: string | undefined): Map<string, Role> {
  const plan = new Map<string, Role>();
  if (!raw) return plan;
  for (const entry of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const [who, role] = entry.split('=').map(s => s.trim().toLowerCase());
    if (!who || !ROLES.includes(role as Role)) {
      console.error(`Ignoring plan entry "${entry}": use name=role with role one of ${ROLES.join(', ')}`);
      continue;
    }
    plan.set(who, role as Role);
  }
  return plan;
}

function planArg(): string | undefined {
  const i = process.argv.indexOf('--plan');
  return i >= 0 ? process.argv[i + 1] : process.env.ROLE_PLAN;
}

interface AccountRow {
  email: string;
  role: Role;
  status: string;
  invited: boolean;
  lastLoginAt: Date | null;
  employee: string | null;
  employeeStatus: string | null;
  clientId: string | null;
  company: string | null;
  companyStatus: string | null;
}

async function main() {
  const plan = parsePlan(planArg());
  const accounts = (
    await pool.query<AccountRow>(
      `SELECT u.email::text AS email, u.role, u.status, (u.password_hash IS NULL) AS invited, u.last_login_at AS "lastLoginAt",
              CASE WHEN e.id IS NULL THEN NULL ELSE e.employee_code || ' ' || e.full_name END AS employee,
              e.status AS "employeeStatus", u.client_id AS "clientId", c.company_name AS company, c.status AS "companyStatus"
         FROM users u
         LEFT JOIN employees e ON e.id = u.employee_id
         LEFT JOIN clients c ON c.id = u.client_id
        ORDER BY array_position(ARRAY['admin','manager','employee','client'], u.role), u.email`,
    )
  ).rows;
  const unlinkedEmployees = (
    await pool.query<{ code: string; name: string; workEmail: string; status: string }>(
      `SELECT e.employee_code AS code, e.full_name AS name, e.work_email::text AS "workEmail", e.status
         FROM employees e
        WHERE e.status <> 'inactive' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.employee_id = e.id)
        ORDER BY e.employee_code`,
    )
  ).rows;

  const flags: string[] = [];
  const planFor = (email: string) => plan.get(email.toLowerCase()) ?? plan.get(email.split('@')[0].toLowerCase());
  const matched = new Set<string>();

  console.log(`${accounts.length} login(s):`);
  for (const a of accounts) {
    const state = a.status === 'disabled' ? 'disabled' : a.invited ? 'invited' : 'active';
    const last = a.lastLoginAt ? a.lastLoginAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never';
    const link = a.role === 'client' ? `client: ${a.company ?? '(none)'}` : `employee: ${a.employee ?? '(none)'}`;
    console.log(`  ${a.email.padEnd(36)} ${a.role.padEnd(8)} ${state.padEnd(8)} ${link.padEnd(40)} last login: ${last}`);

    const planned = planFor(a.email);
    if (planned) {
      for (const key of [a.email.toLowerCase(), a.email.split('@')[0].toLowerCase()]) if (plan.has(key)) matched.add(key);
      if (planned !== a.role) flags.push(`${a.email}: planned as ${planned}, is ${a.role}`);
    } else if (plan.size > 0 && (a.role === 'admin' || a.role === 'manager')) {
      flags.push(`${a.email}: is ${a.role} but not in the role plan`);
    }
    if (a.role === 'client' && !a.clientId) flags.push(`${a.email}: client login without a client company`);
    if (a.role === 'client' && a.companyStatus === 'inactive') flags.push(`${a.email}: client login of an inactive company`);
    if (a.role === 'employee' && !a.employee) flags.push(`${a.email}: employee login without an employee record (no attendance or payslips)`);
    if (a.employeeStatus === 'inactive' && a.status === 'active') flags.push(`${a.email}: active login linked to an inactive employee`);
  }
  for (const [who, role] of plan) if (!matched.has(who)) flags.push(`${who}: planned as ${role}, but no login matches`);

  console.log(`\n${unlinkedEmployees.length} employee record(s) without a login:`);
  for (const e of unlinkedEmployees) console.log(`  ${e.code} ${e.name} <${e.workEmail}> (${e.status})`);
  for (const e of unlinkedEmployees) {
    if (accounts.some(a => a.email.toLowerCase() === e.workEmail.toLowerCase())) {
      flags.push(`${e.code} ${e.name}: a login with the same email exists but is not linked (npm run link-by-email)`);
    }
  }

  console.log(flags.length ? `\n${flags.length} flag(s):` : '\nNo flags.');
  for (const flag of flags) console.log(`  ! ${flag}`);
  if (plan.size === 0) console.log('\n(No role plan given: pass --plan "name=role,..." or set ROLE_PLAN to check roles.)');
}

main()
  .catch(err => {
    console.error(`check-accounts failed: ${err instanceof Error ? err.name : 'Error'}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
