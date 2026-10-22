// The sidebar per role (cosmetic: the server is the guard). Managers get no money pages at all.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/context/AppContext', () => ({ useApp: () => ({}) }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({}) }));
const { getNavItems } = await import('../src/components/layout/Sidebar');

const MONEY_PAGES = ['/invoices', '/reports', '/accounting', '/salary', '/settings'];
const paths = (role: Parameters<typeof getNavItems>[0], linked = true) => getNavItems(role, linked).map(i => i.to);

describe('sidebar items', () => {
  it('managers: operations only, no Invoices, Reports, Accounting, Salary or Settings', () => {
    const manager = paths('manager');
    for (const page of MONEY_PAGES) expect(manager).not.toContain(page);
    expect(manager).toEqual(expect.arrayContaining(['/dashboard', '/projects', '/tasks', '/employees', '/attendance', '/leaves', '/clients']));
    // Their own payslips only when linked to an employee record.
    expect(manager).toContain('/salary/slips');
    expect(paths('manager', false)).not.toContain('/salary/slips');
  });

  it('admins keep every money page', () => {
    expect(paths('admin')).toEqual(expect.arrayContaining(MONEY_PAGES));
  });
});
