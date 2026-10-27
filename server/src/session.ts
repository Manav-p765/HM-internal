import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './config.js';
import { pool } from './db.js';

const PgStore = connectPgSimple(session);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    // When the user signed in (ms since epoch, from services/clock.ts). The session ends
    // SESSION_LIFETIME_MS after this, however active it is (checked in requireSession).
    loginAt?: number;
  }
}

// Absolute lifetime of a sign-in, for every role. Activity (requests, presence heartbeats) never extends it.
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const sessionMiddleware = session({
  name: 'hm.sid',
  store: new PgStore({
    pool,
    tableName: 'sessions', // table created by 001_init.sql
    pruneSessionInterval: config.isTest ? false : 15 * 60,
  }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // Not rolling: the cookie expires SESSION_LIFETIME_MS after it was issued. The server-side check on
  // loginAt (requireSession) is what enforces the limit; the cookie expiry just matches it.
  rolling: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_LIFETIME_MS,
  },
});
