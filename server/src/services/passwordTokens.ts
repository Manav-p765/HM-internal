import type { PoolClient } from 'pg';
import { query } from '../db.js';
import { generateToken, hashToken } from './passwords.js';

// Emailed password links (password_tokens, migration 010). Both kinds open /set-password?token=...:
//   invite: the account has no password yet (password_hash NULL); 72 hours.
//   reset:  forgot-password or an admin's "send reset link"; 1 hour.
// Only the SHA-256 of the token is stored. A token is usable while unused, unexpired, and its user is active
// (and, for a client user, their company is active). Every failure looks the same to the caller.
export type TokenPurpose = 'invite' | 'reset';

export const TOKEN_TTL_MINUTES: Record<TokenPurpose, number> = { invite: 72 * 60, reset: 60 };

// The conditions that make a token usable, shared by check and claim so they can never disagree.
const USABLE = `t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
  AND u.id = t.user_id AND u.status = 'active' AND (u.client_id IS NULL OR c.status = 'active')`;

/** Creates a token for the user. Older tokens are left alone: call dropOtherTokens once the email went out. */
export async function issueToken(
  db: PoolClient,
  userId: string,
  purpose: TokenPurpose,
): Promise<{ token: string; tokenId: string }> {
  const { token, tokenHash } = generateToken();
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id`,
    [userId, tokenHash, purpose, TOKEN_TTL_MINUTES[purpose]],
  );
  return { token, tokenId: rows[0].id };
}

/** A newer link replaces the older ones: deletes the user's other unused tokens. */
export async function dropOtherTokens(userId: string, keepTokenId: string): Promise<void> {
  await query('DELETE FROM password_tokens WHERE user_id = $1 AND used_at IS NULL AND id <> $2', [userId, keepTokenId]);
}

/** Deletes every unused token of the user (their password was just set or changed). */
export async function dropAllTokens(db: PoolClient, userId: string): Promise<void> {
  await db.query('DELETE FROM password_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
}

/** Read-only: the account behind a usable token, or null for an unknown, expired, used or dead one. */
export async function checkToken(token: string): Promise<{ email: string; purpose: TokenPurpose } | null> {
  const [row] = await query<{ email: string; purpose: TokenPurpose }>(
    `SELECT u.email, t.purpose
       FROM password_tokens t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN clients c ON c.id = u.client_id
      WHERE ${USABLE}`,
    [hashToken(token)],
  );
  return row ?? null;
}

/**
 * Marks the token used and returns its user, or null. The check and the claim are one UPDATE, so of two
 * parallel requests with the same token only one gets a row back (the other waits on the row lock, then
 * sees used_at set).
 */
export async function claimToken(db: PoolClient, token: string): Promise<{ userId: string; purpose: TokenPurpose } | null> {
  const { rows } = await db.query<{ userId: string; purpose: TokenPurpose }>(
    `UPDATE password_tokens t
        SET used_at = now()
       FROM users u
       LEFT JOIN clients c ON c.id = u.client_id
      WHERE ${USABLE}
      RETURNING t.user_id AS "userId", t.purpose`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}
