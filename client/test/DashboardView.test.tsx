// The staff dashboard per role, rendered to static HTML (effects don't run, so no API is called). Managers get
// the operational dashboard only, with no money on it; admins get Overview (finance) and Operations tabs,
// and the Operations tab is the very same component managers see.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { UserRole } from '../src/types';

let role: UserRole = 'manager';
vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ currentUser: { id: 'u1', role, name: 'Test User (Fake)', email: 'test@example.test', employeeId: null } }),
}));

const { DashboardView, dashboardTabsFor } = await import('../src/components/dashboard/DashboardView');

function render(as: UserRole, url = '/dashboard'): string {
  role = as;
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <DashboardView />
    </MemoryRouter>,
  );
}

// Words that only appear on money cards ("Overdue" alone is also a task count, so it is not listed; overdue
// invoices are caught by "Invoice").
const MONEY_WORDS = /Outstanding|Collected|Income|Expense|Net Balance|Payroll|Salary|Invoice|Transaction|Billing|₹/i;

describe('dashboard tabs per role', () => {
  it('admin: Overview and Operations; manager: Operations only', () => {
    expect(dashboardTabsFor('admin')).toEqual(['overview', 'operations']);
    expect(dashboardTabsFor('manager')).toEqual(['operations']);
  });
});

describe('manager dashboard', () => {
  it('is the operational dashboard with the operations subtitle and no money anywhere', () => {
    const html = render('manager');
    expect(html).toContain('data-testid="operations-dashboard"');
    expect(html).toContain('Team attendance and operations overview');
    expect(html).not.toContain('data-testid="finance-overview"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toMatch(MONEY_WORDS);
    for (const card of ['Team Present Today', 'Currently Working', 'Team Headcount', 'Shift Attendance Rate', 'On Approved Leave Today']) {
      expect(html).toContain(card);
    }
  });

  it('cannot reach the finance tab through the URL', () => {
    const html = render('manager', '/dashboard?tab=overview');
    expect(html).toContain('data-testid="operations-dashboard"');
    expect(html).not.toMatch(MONEY_WORDS);
  });
});

describe('admin dashboard', () => {
  it('opens on Overview (finance) with both tabs', () => {
    const html = render('admin');
    expect(html).toContain('data-testid="finance-overview"');
    expect(html).not.toContain('data-testid="operations-dashboard"');
    expect(html).toContain('data-testid="dashboard-tab-overview"');
    expect(html).toContain('data-testid="dashboard-tab-operations"');
    expect(html).toContain('Total Income');
    expect(html).toContain('Outstanding Invoices');
  });

  it('?tab=operations shows the same operational dashboard managers see', () => {
    const admin = render('admin', '/dashboard?tab=operations');
    expect(admin).toContain('data-testid="operations-dashboard"');
    expect(admin).not.toContain('data-testid="finance-overview"');
    const manager = render('manager');
    const section = (html: string) => html.slice(html.indexOf('data-testid="operations-dashboard"'));
    expect(section(admin)).toBe(section(manager));
  });
});
