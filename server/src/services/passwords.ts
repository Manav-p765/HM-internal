import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';

// Minimum policy for passwords users choose themselves (change + reset).
// bcrypt only looks at the first 72 bytes, so longer input is rejected rather than silently truncated.
export const newPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine(p => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes');

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptCost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Compared against when the account doesn't exist, so login takes the same time either way.
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-never-matches', config.bcryptCost);

// No look-alikes: I l 1 O o 0 are left out.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?-';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const pick = (chars: string) => chars[crypto.randomInt(chars.length)];

// 16 characters, at least one of each class, shuffled with a CSPRNG.
export function generateTempPassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < 16) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// One-time tokens (password reset): the raw token goes in the email, only its hash is stored.
export function generateToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
