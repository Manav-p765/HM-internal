// Links employee records to the staff logins that share their email (one-off repair for records created
// before linking was automatic, e.g. an employee that shows "No login" although the person signs in).
//
//   npm run link-by-email              dry run: prints every pair and what would happen, writes nothing
//   npm run link-by-email -- --apply   links the pairs marked "link" (each in its own transaction, re-checked)
//
// Same rules as the app (services/accountLinks.ts): never a client user, never an inactive employee, never
// moves or overwrites an existing link; such pairs are printed as "skip" with the reason. Emails are unique
// on both sides (citext), so a pair is never ambiguous; a side that is already linked elsewhere is skipped.
// Every applied link is audited (user.employee_linked, how: 'script'). Prints no secrets.
import { pool, withTransaction } from '../db.js';
import { linkLoginByEmail, linkPlan } from '../services/accountLinks.js';
import { audit } from '../services/audit.js';

const apply = process.argv.includes('--apply');

async function main() {
  const plan = await linkPlan(pool);
  if (plan.length === 0) {
    console.log('Nothing to do: every employee/login pair with the same email is already linked.');
    return;
  }

  console.log(apply ? 'Applying links:' : 'Dry run (nothing is written; add --apply to link):');
  let linked = 0;
  for (const row of plan) {
    const pair = `${row.employeeCode} ${row.employeeName} <-> ${row.email} (${row.role})`;
    if (row.action === 'skip') {
      console.log(`  skip  ${pair}: ${row.reason}`);
      continue;
    }
    if (!apply) {
      console.log(`  link  ${pair}`);
      continue;
    }
    const userId = await withTransaction(client => linkLoginByEmail(client, row.employeeId));
    if (userId) {
      linked++;
      await audit(null, { action: 'user.employee_linked', entityType: 'user', entityId: userId, metadata: { employeeId: row.employeeId, how: 'script' } });
      console.log(`  linked ${pair}`);
    } else {
      console.log(`  skip  ${pair}: changed since the plan was made`);
    }
  }
  const toLink = plan.filter(r => r.action === 'link').length;
  console.log(apply ? `Done: ${linked} linked, ${plan.length - linked} skipped.` : `${toLink} to link, ${plan.length - toLink} to skip.`);
}

main()
  .catch(err => {
    console.error(`link-by-email failed: ${err instanceof Error ? err.name : 'Error'}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
