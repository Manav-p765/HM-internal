// Creates the first admin (the dev seed refuses to run in production).
// Usage: npm run create-admin -w server -- --email you@example.com
// The password is typed at a hidden prompt (or read from stdin when piped); it is never an argument.
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { z } from 'zod';
import { pool, query } from '../db.js';
import { audit } from '../services/audit.js';
import { hashPassword, newPasswordSchema } from '../services/passwords.js';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readPasswords(): Promise<[string, string]> {
  // Piped input (automation): first line is the password, no confirmation needed.
  if (!process.stdin.isTTY) {
    return new Promise(resolve => {
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', line => {
        rl.close();
        resolve([line, line]);
      });
    });
  }

  // Interactive: echo is suppressed by swallowing everything readline writes after the prompt.
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  const ask = (prompt: string) =>
    new Promise<string>(resolve => {
      muted = false;
      rl.question(prompt, answer => {
        muted = false;
        process.stdout.write('\n');
        resolve(answer);
      });
      muted = true;
    });

  return (async () => {
    const first = await ask('Password (min 10 characters): ');
    const second = await ask('Repeat password: ');
    rl.close();
    return [first, second];
  })();
}

const emailArgIndex = process.argv.indexOf('--email');
const emailResult = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .safeParse(emailArgIndex === -1 ? undefined : process.argv[emailArgIndex + 1]);
if (!emailResult.success) fail('Usage: npm run create-admin -w server -- --email you@example.com');
const email = emailResult.data;

try {
  const [existing] = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing) fail(`A user with the email ${email} already exists. Nothing was changed.`);

  const [password, repeat] = await readPasswords();
  if (password !== repeat) fail('Passwords do not match. Nothing was changed.');
  const checked = newPasswordSchema.safeParse(password);
  if (!checked.success) fail(`${checked.error.issues[0].message}. Nothing was changed.`);

  const [user] = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, status, must_change_password)
     VALUES ($1, $2, 'admin', 'active', false) RETURNING id`,
    [email, await hashPassword(password)],
  );
  await audit(null, {
    action: 'user.created',
    entityType: 'user',
    entityId: user.id,
    metadata: { email, role: 'admin', via: 'create-admin script' },
  });
  console.log(`Admin ${email} created. They can sign in now.`);
} finally {
  await pool.end();
}
