// The dev seed only ever runs against a local database, whatever NODE_ENV or flags say, and never prints
// the DATABASE_URL (only the host name).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSeedHost } from '../src/scripts/seedGuard.js';

const SECRET = 'NotARealPassword-9f3c';

describe('checkSeedHost', () => {
  it('allows localhost, 127.0.0.1, ::1 and the compose service "db"', () => {
    for (const [url, host] of [
      [`postgres://hm:${SECRET}@localhost:5440/hm_internal`, 'localhost'],
      [`postgres://hm:${SECRET}@127.0.0.1:5440/hm_internal`, '127.0.0.1'],
      [`postgresql://hm:${SECRET}@[::1]:5432/hm_internal`, '::1'],
      [`postgres://hm:${SECRET}@db:5432/hm_internal`, 'db'],
      [`postgres://hm:${SECRET}@LOCALHOST/hm_internal`, 'localhost'],
    ]) {
      expect(checkSeedHost(url)).toEqual({ ok: true, host });
    }
  });

  it('refuses every other host and anything it cannot be sure about, without echoing the URL', () => {
    const refused = [
      `postgres://hm:${SECRET}@ep-fake-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require`,
      `postgres://hm:${SECRET}@10.0.0.5:5432/hm_internal`,
      `postgres://hm:${SECRET}@db.example.test:5432/hm_internal`,
      `postgres://hm:${SECRET}@localhost.example.test/hm_internal`,
      `postgres://hm:${SECRET}@127.0.0.2/hm_internal`,
      `postgres://hm:${SECRET}@localhost/hm_internal?host=ep-fake.neon.tech`,
      `postgres://hm:${SECRET}@/hm_internal`,
      `mysql://hm:${SECRET}@localhost/hm_internal`,
      `not a url ${SECRET}`,
      undefined,
    ];
    for (const url of refused) {
      const result = checkSeedHost(url);
      expect(result.ok, String(url)).toBe(false);
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(JSON.stringify(result)).not.toMatch(/postgres(ql)?:\/\//);
    }
  });
});

describe('npm run db:seed against a remote host', () => {
  it('exits 1 before connecting, naming only the host, even with --reset', () => {
    const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'src/scripts/seed.ts', '--reset'], {
      cwd: serverDir,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: `postgres://neondb_owner:${SECRET}@ep-fake-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require`,
      },
    });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(run.status).toBe(1);
    expect(output).toContain('Refusing to seed: database host "ep-fake-name-123456.eu-central-1.aws.neon.tech" is not local');
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain('neondb_owner');
    expect(output).not.toMatch(/postgres(ql)?:\/\//);
  });
});
