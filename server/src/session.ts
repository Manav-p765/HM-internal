import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { config } from './config.js';
import { pool } from './db.js';

const PgStore = connectPgSimple(session);

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

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
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: 12 * 60 * 60 * 1000, // 12h, refreshed on activity
  },
});
