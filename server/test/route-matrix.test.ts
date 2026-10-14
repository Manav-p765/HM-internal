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
import { pool, query } from '../src/db.js';
import { hashPassword } from '../src/services/passwords.js';

// Routes a client user may call. Anything added here is a deliberate decision.
const CLIENT_ALLOWED = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'GET /api/clients/me',
]);

// Routes that need no sign-in at all.
const PUBLIC = new Set([
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
]);

interface FoundRoute {
  method: string;
  path: string;
  key: string;
  declared: DeclaredRoute | undefined;
}

type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle: { stack?: Layer[] } };

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
        routes.push({ method, path, key, declared });
      }
    }
  }
  return { routes, problems };
}

// Fill route params with a syntactically valid id that matches nothing.
const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-a000-00000000dead');

let clientAgent: request.Agent;

beforeAll(async () => {
  await query('TRUNCATE audit_logs, auth_tokens, sessions, users, employees, clients CASCADE');
  const [company] = await query<{ id: string }>(`INSERT INTO clients (company_name) VALUES ('Matrix Co (Fake)') RETURNING id`);
  await query(
    `INSERT INTO users (email, password_hash, role, client_id) VALUES ('matrix-client@example.test', $1, 'client', $2)`,
    [await hashPassword('correct-horse-battery'), company.id],
  );
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

  it('an anonymous caller gets 401 on every non-public route', async () => {
    for (const route of collectRoutes().routes) {
      if (PUBLIC.has(route.key)) continue;
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[route.method](concrete(route.path)).send({});
      expect({ route: route.key, status: res.status }).toEqual({ route: route.key, status: 401 });
    }
  });
});
