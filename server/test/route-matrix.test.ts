// Deny-by-default guard for the whole API. It walks the routes Express actually has registered and checks:
//   1. every router was mounted with mountRouter() and every route was declared through createRouter()
//      (i.e. with an explicit access list), and nothing is registered directly on the /api router;
//   2. a signed-in CLIENT user gets 403 on every route except an explicit allowlist;
//   3. an anonymous caller gets 401 on every route that isn't public.
// Adding a route without roles, or one that a client can reach by accident, makes this test fail.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { api, app } from '../src/app.js';
import { mountedRouters, type DeclaredRoute } from '../src/middleware/access.js';
import type { LimitSpec } from '../src/middleware/security.js';
import { pool, query } from '../src/db.js';
import { hashPassword } from '../src/services/passwords.js';

// Routes a client user may call. Anything added here is a deliberate decision.
const CLIENT_ALLOWED = new Set([
  'GET /api/health',
  'GET /api/health/ready',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/forgot-password',
  'GET /api/auth/set-password/check',
  'POST /api/auth/set-password',
  'GET /api/clients/me',
  // The client portal API (every route is ['client'] and scoped to req.user.clientId).
  'GET /api/portal/projects',
  'GET /api/portal/projects/:id/tasks',
  'GET /api/portal/tasks/:id/comments',
  'POST /api/portal/tasks/:id/comments',
  // Who works on the company's projects and their status today (name, designation, avatar, status, projects).
  'GET /api/portal/team',
]);

// Routes that need no sign-in at all.
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/health/ready',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  // The emailed set-password link (invite or reset): check it, then use it. Deliberately public.
  'GET /api/auth/set-password/check',
  'POST /api/auth/set-password',
]);

// Routes that send email (invite or reset links). Each must be rate limited like a public route.
const SENDS_EMAIL = new Set([
  'POST /api/auth/forgot-password',
  'POST /api/users/',
  'POST /api/users/:id/resend-invite',
  'POST /api/users/:id/send-reset-link',
]);

interface FoundRoute {
  method: string;
  path: string;
  key: string;
  declared: DeclaredRoute | undefined;
  /** Names of the rate limiters (createLimiter) in this route's handler chain. */
  limits: string[];
}

type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: { rateLimit?: LimitSpec } }[] };
  handle: { stack?: Layer[] };
};

function joinPath(prefix: string, path: string): string {
  return `/api${prefix === '/' ? '' : prefix}${path}`;
}

function collectRoutes(): { routes: FoundRoute[]; problems: string[] } {
  const routes: FoundRoute[] = [];
  const problems: string[] = [];
  for (const layer of (api as unknown as { stack: Layer[] }).stack) {
    if (layer.route) {
      problems.push(`route ${layer.route.path} registered directly on /api (use createRouter + mountRouter)`);
      continue;
    }
    if (!layer.handle.stack) continue; // plain middleware (checkOrigin, session, 404 handler)
    const mounted = [...mountedRouters].find(([, r]) => r._express === (layer.handle as unknown));
    if (!mounted) {
      problems.push('a router is mounted on /api without mountRouter(), so its routes have no declared access');
      continue;
    }
    const [prefix, router] = mounted;
    for (const inner of layer.handle.stack) {
      if (!inner.route) {
        problems.push(`router ${prefix} has middleware that bypasses createRouter`);
        continue;
      }
      for (const method of Object.keys(inner.route.methods).filter(m => m !== '_all')) {
        const declared = router.routes.find(r => r.method === method && r.path === inner.route!.path);
        const path = joinPath(prefix, inner.route.path);
        const key = `${method.toUpperCase()} ${path}`;
        if (!declared) problems.push(`${key} was added without createRouter (no declared access)`);
        const limits = inner.route.stack.flatMap(l => (l.handle.rateLimit ? [l.handle.rateLimit.name] : []));
        routes.push({ method, path, key, declared, limits });
      }
    }
  }
  return { routes, problems };
}

// Fill route params with a syntactically valid id that matches nothing.
const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-a000-00000000dead');

let clientAgent: request.Agent;
const staffAgents: Record<string, request.Agent> = {};

beforeAll(async () => {
  await query('TRUNCATE audit_logs, password_tokens, sessions, users, employees, clients CASCADE');
  const [company] = await query<{ id: string }>(`INSERT INTO clients (company_name) VALUES ('Matrix Co (Fake)') RETURNING id`);
  await query(
    `INSERT INTO users (email, password_hash, role, client_id) VALUES ('matrix-client@example.test', $1, 'client', $2)`,
    [await hashPassword('correct-horse-battery'), company.id],
  );
  for (const role of ['admin', 'manager', 'employee'] as const) {
    await query(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)`, [
      `matrix-${role}@example.test`,
      await hashPassword('correct-horse-battery'),
      role,
    ]);
    staffAgents[role] = request.agent(app);
    await staffAgents[role].post('/api/auth/login').send({ email: `matrix-${role}@example.test`, password: 'correct-horse-battery' }).expect(200);
  }
  clientAgent = request.agent(app);
  await clientAgent
    .post('/api/auth/login')
    .send({ email: 'matrix-client@example.test', password: 'correct-horse-battery' })
    .expect(200);
});

afterAll(async () => {
  await pool.end();
});

describe('route matrix (deny by default)', () => {
  it('finds the API routes, all declared through createRouter/mountRouter', () => {
    const { routes, problems } = collectRoutes();
    expect(problems).toEqual([]);
    // Sanity: the walk really sees the app (auth, users, employees, clients...).
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.map(r => r.key)).toContain('GET /api/clients/me');
    // Every allowlisted route still exists (a stale allowlist would hide mistakes).
    for (const key of CLIENT_ALLOWED) expect(routes.map(r => r.key)).toContain(key);
  });

  it('declared access matches the allowlists', () => {
    for (const route of collectRoutes().routes) {
      const access = route.declared?.access;
      const clientMayCall = access === 'public' || access === 'session' || (Array.isArray(access) && access.includes('client'));
      expect({ route: route.key, clientMayCall }).toEqual({ route: route.key, clientMayCall: CLIENT_ALLOWED.has(route.key) });
      expect({ route: route.key, isPublic: access === 'public' }).toEqual({ route: route.key, isPublic: PUBLIC.has(route.key) });
    }
  });

  it('salary routes: admin only, except an employee’s own published slips', () => {
    const salary = Object.fromEntries(
      collectRoutes()
        .routes.filter(r => r.path === '/api/salary' || r.path.startsWith('/api/salary/'))
        .map(r => [r.key, r.declared?.access]),
    );
    const ADMIN = ['admin'];
    const OWN_SLIPS = ['employee', 'manager', 'admin']; // ownership is checked in SQL by req.user.employeeId
    expect(salary).toEqual({
      'GET /api/salary/': ADMIN,
      'POST /api/salary/generate': ADMIN,
      'GET /api/salary/:id': ADMIN,
      'PATCH /api/salary/:id': ADMIN,
      'POST /api/salary/:id/adjustments': ADMIN,
      'DELETE /api/salary/:id/adjustments/:lineId': ADMIN,
      'POST /api/salary/:id/pay': ADMIN,
      'POST /api/salary/:id/unpay': ADMIN,
      'POST /api/salary/:id/publish-slip': ADMIN,
      'POST /api/salary/:id/unpublish-slip': ADMIN,
      'GET /api/salary/slips/me': OWN_SLIPS,
      'GET /api/salary/slips/me/:id': OWN_SLIPS,
    });
  });

  it('ledger and report routes: admin only, except the invoice report (admin, manager); no DELETE on the ledger', () => {
    const finance = Object.fromEntries(
      collectRoutes()
        .routes.filter(r => r.path.startsWith('/api/transactions') || r.path.startsWith('/api/reports'))
        .map(r => [r.key, r.declared?.access]),
    );
    const ADMIN = ['admin'];
    const ADMIN_MANAGER = ['admin', 'manager'];
    expect(finance).toEqual({
      'GET /api/transactions/': ADMIN,
      'GET /api/transactions/export.csv': ADMIN,
      'GET /api/transactions/categories': ADMIN,
      'POST /api/transactions/categories': ADMIN,
      'PATCH /api/transactions/categories/:id': ADMIN,
      'POST /api/transactions/': ADMIN,
      'PATCH /api/transactions/:id': ADMIN,
      'POST /api/transactions/:id/void': ADMIN,
      'GET /api/reports/profit-loss': ADMIN,
      'GET /api/reports/profit-loss.csv': ADMIN,
      'GET /api/reports/trend': ADMIN,
      'GET /api/reports/invoices': ADMIN_MANAGER,
      'GET /api/reports/invoices.csv': ADMIN_MANAGER,
      'GET /api/reports/salary': ADMIN,
      'GET /api/reports/salary.csv': ADMIN,
    });
  });

  it('a client session gets 403 on every route outside the allowlist', async () => {
    const checked: string[] = [];
    for (const route of collectRoutes().routes) {
      if (CLIENT_ALLOWED.has(route.key)) continue;
      const res = await (clientAgent as unknown as Record<string, (u: string) => request.Test>)[route.method](concrete(route.path)).send({});
      expect({ route: route.key, status: res.status, code: res.body.code }).toEqual({ route: route.key, status: 403, code: 'FORBIDDEN' });
      checked.push(route.key);
    }
    expect(checked.length).toBeGreaterThan(15);
    // The client is still signed in (nothing above logged it out) and can read its own company.
    await clientAgent.get('/api/clients/me').expect(200);
  });

  it('staff (admin, manager, employee) get 403 on every /api/portal route', async () => {
    const portalRoutes = collectRoutes().routes.filter(r => r.path.startsWith('/api/portal/'));
    expect(portalRoutes.length).toBeGreaterThanOrEqual(4);
    for (const [role, agent] of Object.entries(staffAgents)) {
      for (const route of portalRoutes) {
        const res = await (agent as unknown as Record<string, (u: string) => request.Test>)[route.method](concrete(route.path)).send({});
        expect({ role, route: route.key, status: res.status }).toEqual({ role, route: route.key, status: 403 });
      }
    }
  });

  it('every public route and every route that sends email is rate limited', () => {
    const routes = collectRoutes().routes;
    for (const key of SENDS_EMAIL) expect(routes.map(r => r.key)).toContain(key);
    const needed = routes.filter(r => r.declared?.access === 'public' || SENDS_EMAIL.has(r.key));
    expect(needed.map(r => r.key).sort()).toEqual([...new Set([...PUBLIC, ...SENDS_EMAIL])].sort());
    for (const route of needed) {
      expect({ route: route.key, limited: route.limits.length > 0 }).toEqual({ route: route.key, limited: true });
    }
    // Spot checks of the table itself.
    expect(routes.find(r => r.key === 'POST /api/auth/forgot-password')!.limits).toEqual(['forgot-password', 'forgot-password-per-email']);
    expect(routes.find(r => r.key === 'POST /api/users/')!.limits).toEqual(['account-mail']);
    // The set-password link is limited per IP and per token.
    expect(routes.find(r => r.key === 'GET /api/auth/set-password/check')!.limits).toEqual(['set-password-check', 'set-password-check-per-token']);
    expect(routes.find(r => r.key === 'POST /api/auth/set-password')!.limits).toEqual(['set-password', 'set-password-per-token']);
  });

  it('an anonymous caller gets 401 on every non-public route', async () => {
    for (const route of collectRoutes().routes) {
      if (PUBLIC.has(route.key)) continue;
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[route.method](concrete(route.path)).send({});
      expect({ route: route.key, status: res.status }).toEqual({ route: route.key, status: 401 });
    }
  });
});
