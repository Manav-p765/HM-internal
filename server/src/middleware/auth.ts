import type { Request, RequestHandler } from 'express';
import { query } from '../db.js';
import { HttpError } from './errors.js';

export type Role = 'admin' | 'manager' | 'employee';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId: string | null;
  mustChangePassword: boolean;
  name: string | null; // employee full name when the account is linked to an employee
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const rows = await query<SessionUser>(
    `SELECT u.id, u.email, u.role, u.employee_id AS "employeeId",
            u.must_change_password AS "mustChangePassword", e.full_name AS name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1 AND u.status = 'active'`,
    [userId],
  );
  return rows[0] ?? null;
}

export function destroySession(req: Request): Promise<void> {
  return new Promise(resolve => req.session.destroy(() => resolve()));
}

// Loads the user for the session on every request, so a disabled account or a changed role
// takes effect immediately. Does NOT apply the forced-password-change gate.
export const requireSession: RequestHandler = async (req, _res, next) => {
  const userId = req.session.userId;
  const user = userId ? await loadSessionUser(userId) : null;
  if (!user) {
    if (userId) await destroySession(req);
    throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');
  }
  req.user = user;
  next();
};

// requireSession + the gate: until the temporary password is changed, nothing else is reachable.
// Only /auth/me, /auth/logout and /auth/change-password use requireSession directly.
export const requireAuth: RequestHandler[] = [
  requireSession,
  (req, _res, next) => {
    if (req.user!.mustChangePassword) {
      throw new HttpError(403, 'You must change your password before continuing', 'PASSWORD_CHANGE_REQUIRED');
    }
    next();
  },
];

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, 'You do not have permission to do this', 'FORBIDDEN');
    }
    next();
  };
}

// Signs a user out everywhere (optionally keeping the session that is making the request).
export async function deleteUserSessions(userId: string, exceptSid?: string): Promise<void> {
  await query(`DELETE FROM sessions WHERE sess->>'userId' = $1 AND sid <> $2`, [userId, exceptSid ?? '']);
}
