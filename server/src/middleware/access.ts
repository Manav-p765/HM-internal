import { Router, type Request, type RequestHandler } from 'express';
import { requireAuth, requireRole, requireSession, type Role } from './auth.js';
import { HttpError } from './errors.js';

// Deny by default: every route states who may call it, at the point it is declared.
//   'public'  - no sign-in (login, forgot/reset password, health)
//   'session' - signed in, exempt from the forced-password-change gate (only /auth/me, /logout, /change-password)
//   Role[]    - signed in, password changed, and one of these roles
export type Access = 'public' | 'session' | readonly Role[];

export const STAFF = ['admin', 'manager', 'employee'] as const satisfies readonly Role[];

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface DeclaredRoute {
  method: Method;
  path: string;
  access: Access;
}

function guardsFor(access: Access): RequestHandler[] {
  if (access === 'public') return [];
  if (access === 'session') return [requireSession];
  if (!Array.isArray(access) || access.length === 0) {
    // A missing or empty role list must never mean "everyone".
    throw new Error('Route access must be "public", "session" or a non-empty role list');
  }
  return [...requireAuth, requireRole(...access)];
}

// A router whose only way to add a route is with an access declaration. The underlying Express router is
// kept private; mount it with mountRouter() so the route-matrix test can see it.
export function createRouter() {
  const router = Router();
  const routes: DeclaredRoute[] = [];
  const add =
    (method: Method) =>
    (path: string, access: Access, ...handlers: RequestHandler[]) => {
      router[method](path, ...guardsFor(access), ...handlers);
      routes.push({ method, path, access });
    };
  return {
    get: add('get'),
    post: add('post'),
    patch: add('patch'),
    put: add('put'),
    delete: add('delete'),
    /** @internal used by mountRouter and the route-matrix test */
    _express: router,
    routes,
  };
}

export type SecureRouter = ReturnType<typeof createRouter>;

// Every mounted router, by mount path, for the route-matrix test.
export const mountedRouters = new Map<string, SecureRouter>();

export function mountRouter(parent: Router, path: string, router: SecureRouter): void {
  mountedRouters.set(path, router);
  parent.use(path, router._express);
}

// The signed-in client user's company. Client-scoped queries use this, never an id from the request.
export function clientScope(req: Request): string {
  const clientId = req.user?.role === 'client' ? req.user.clientId : null;
  if (!clientId) throw new HttpError(403, 'You do not have permission to do this', 'FORBIDDEN');
  return clientId;
}
