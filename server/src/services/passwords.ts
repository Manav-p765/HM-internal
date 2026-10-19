import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';

// Policy for passwords users choose themselves (set-password link, change). A password is used exactly as
// typed: never trimmed or normalised, here or in the browser. Spaces anywhere are valid characters and count
// towards the length; only a password made of nothing but whitespace is refused.
// bcrypt only looks at the first 72 bytes, so longer input is rejected rather than silently truncated.
export const MIN_PASSWORD_LENGTH = 10;
export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine(p => p.trim() !== '', 'Password cannot be only spaces')
  .refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes');

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptCost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Compared against when the account doesn't exist, so login takes the same time either way.
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-matches', config.bcryptCost);

// One-time tokens (invite and reset links): 32 random bytes, base64url. The raw token goes in the email;
// only its SHA-256 hash is stored.
export function generateToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
