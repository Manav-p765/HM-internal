// PostToolUse (Edit|Write|MultiEdit): type-check only the workspace that was edited.
// There is no ESLint/Prettier here, so tsc is the only automatic check.
// Exit code 2 feeds the tsc errors back to Claude.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = path.relative(projectDir, path.resolve(projectDir, filePath)).split(path.sep).join('/');

const workspace = rel.startsWith('client/') ? 'client' : rel.startsWith('server/') ? 'server' : null;
const isTsInput = /\.(ts|tsx|mts|cts)$/.test(rel) || /(^|\/)tsconfig[^/]*\.json$/.test(rel);
if (!workspace || !isTsInput) process.exit(0);

const result = spawnSync('npm', ['run', 'lint', '-w', workspace, '--silent'], {
  cwd: projectDir,
  encoding: 'utf8',
  shell: true,
});

if (result.status !== 0) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const lines = output.split('\n');
  const shown = lines.length > 60 ? [...lines.slice(0, 60), `... (${lines.length - 60} more lines)`] : lines;
  process.stderr.write(`Type errors in ${workspace} (npm run lint -w ${workspace}):\n${shown.join('\n')}\n`);
  process.exit(2);
}
process.exit(0);
