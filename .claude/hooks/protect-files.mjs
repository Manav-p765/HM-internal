// PreToolUse (Edit|Write|MultiEdit): refuse edits to files Claude must not hand-edit.
//   - .env / .env.* (real secrets; the placeholder-only .env.example and .env.production.example are allowed)
//   - package-lock.json (any workspace; change it via npm)
//   - any existing file in server/db/migrations/ (applied migrations are never re-run; add a new file instead)
// Exit code 2 blocks the tool call and shows stderr to Claude.
import fs from 'node:fs';
import path from 'node:path';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const abs = path.resolve(projectDir, filePath);
const rel = path.relative(projectDir, abs).split(path.sep).join('/');
const base = path.basename(abs);

function block(reason) {
  process.stderr.write(`Blocked edit to ${rel}: ${reason}\n`);
  process.exit(2);
}

// The committed example files (placeholders only) may be edited; every real .env file stays blocked.
const ENV_EXAMPLES = new Set(['.env.example', '.env.production.example']);
if ((base === '.env' || base.startsWith('.env.')) && !ENV_EXAMPLES.has(base)) {
  block('.env files hold real secrets (SESSION_SECRET, DATABASE_URL). Ask the user to change it.');
}
if (base === 'package-lock.json') {
  block('the lockfile is generated. Use npm install / npm uninstall instead.');
}
if (rel.startsWith('server/db/migrations/') && fs.existsSync(abs)) {
  block(
    'existing migrations may already be applied and are never re-run, so editing one splits dev and ' +
      'production schemas. Create a new numbered migration file instead.',
  );
}
process.exit(0);
