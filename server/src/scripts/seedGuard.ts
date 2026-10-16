// The dev seed may only ever touch a local database: localhost, 127.0.0.1, ::1 or the docker-compose service
// "db". Checked on the DATABASE_URL host alone, whatever NODE_ENV or flags say. Only the host name is ever
// reported, never the URL (it carries the password).
export const SEED_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1', 'db'] as const;

export type SeedHostCheck = { ok: true; host: string } | { ok: false; reason: string };

export function checkSeedHost(databaseUrl: string | undefined): SeedHostCheck {
  if (!databaseUrl) return { ok: false, reason: 'DATABASE_URL is not set' };
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { ok: false, reason: 'DATABASE_URL could not be parsed' };
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    return { ok: false, reason: 'DATABASE_URL does not use the postgres scheme' };
  }
  // pg lets ?host= (or a socket path) override the URL host; refuse rather than guess where it points.
  if (url.searchParams.has('host') || url.searchParams.has('hostaddr')) {
    return { ok: false, reason: 'DATABASE_URL sets host= in its query string' };
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return { ok: false, reason: 'DATABASE_URL has no host' };
  if (!(SEED_ALLOWED_HOSTS as readonly string[]).includes(host)) {
    return { ok: false, reason: `database host "${host}" is not local (allowed: ${SEED_ALLOWED_HOSTS.join(', ')})` };
  }
  return { ok: true, host };
}
