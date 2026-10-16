# Pre-push readiness

State checked on 2026-10-16, before the first push. Nothing has been pushed and no history has been rewritten. The repository has 51 commits reachable from its branches (including this file and the merge of the review fixes), no tags and no remote.

Branches:

- `main`: everything below, merged. This is the branch to push.
- `fix/security-review`: the review fixes (M1, M2 and lows a–h), one commit each, merged into `main`.
- `docs/neon`: production readiness and the Neon notes, already merged into `main`.
- `backup/main-20261016`, `backup/docs-neon-20261016`: safety copies of the two tips from before the merge. Keep them locally; there is no need to push them.

## 1. Commit authors

`git log --all --format='%an <%ae>' | sort | uniq -c` shows two identities:

| Commits | Identity |
|---|---|
| 44 | the main developer's company address (`@hybridmonks.com`) |
| 5 | a personal address (`@gmail.com`): the early prototype import and setup commits |

Committer identities are the same two. If the history should show one identity, rewrite it **before the first push**, on a fresh clone, never on a clone someone else uses. The commands below are reference text only and have not been run. Replace `NAME`, `EMAIL`, `OLD_EMAIL_1` and `OLD_EMAIL_2` with real values on your machine; don't commit them.

Option A, git filter-repo (recommended: one pass over every branch; keeps dates, messages and merges). Needs Python 3 and `pip install git-filter-repo`.

```text
git clone --no-local <path-to-this-repo> hm-rewrite
cd hm-rewrite
printf 'NAME <EMAIL> <OLD_EMAIL_1>\nNAME <EMAIL> <OLD_EMAIL_2>\n' > ../mailmap.txt
git filter-repo --mailmap ../mailmap.txt
git log --all --format='%an <%ae>' | sort | uniq -c     # expect a single line
```

Then push from `hm-rewrite`, not from the original folder. Every commit hash changes, including the ones quoted in this file.

Option B, rebase (no install, but one branch at a time, and `main` now contains merge commits):

```text
git config user.name "NAME"; git config user.email "EMAIL"
git checkout main
git rebase -r --root --exec "git commit --amend --no-edit --reset-author"
```

Option A is safer: it handles every branch consistently and can't leave a half-rewritten history.

## 2. Secrets scan (full history, every branch)

Method: git only. A `git log --all -G<pattern>` pickaxe ran over every commit's diff (lockfiles excluded, because their integrity hashes look like keys), plus `git grep` on HEAD. No scanner was installed.

| Pattern | Commits | Verdict |
|---|---|---|
| private key blocks, `sk-`/`sk-ant-`, Resend `re_`, GitHub `ghp_`/`github_pat_`, AWS `AKIA`, Slack `xox`, Neon `npg_` | none | clean |
| URL with an embedded password | f12db86, 12c4110, e2bebaa, 9aabfc0, 1b75d39 | the local-only Docker dev database password (documented in CLAUDE.md), placeholders in the `.env` examples and restore script, and fake URLs in `server/test/seed-guard.test.ts` |
| `neon.tech` host names | 1b75d39 | the fake `ep-fake-name-123456…` host in the seed-guard test; `docs/NEON.md` has no host, connection string or key |
| `SESSION_SECRET` values | vitest config, config tests | a test-only literal; no real secret |
| password literals, bcrypt hash | tests, `seed.dev.sql` | test fixtures and the hash of the documented dev seed password |
| tracked `.env` files | `.env.example`, `.env.production.example` (and a removed `client/.env.example`) | placeholders only; `.env` has never been tracked |

Fake demo passwords from the prototype were added and later removed (cd4a2c7). They are not in HEAD, but they remain in history.

**Result: no real secret found.** The scan covers every commit reachable from a branch. It can't see secrets that were never committed, and pattern matching can miss unusual key formats.

## 3. Tracked files (HEAD)

- `.env*`: only the two examples are tracked. `.env`, `.env.production` and `.env.*` are ignored, and a Claude Code hook blocks edits to real `.env` files.
- Backups and dumps: none tracked; `backups/`, `*.dump`, `*.dump.gz` are ignored.
- `.playwright-mcp/` (screenshots, logs): ignored and never tracked.
- No personal email addresses, drive letters or user-profile paths in tracked files.
- Large binaries: two placeholder avatar photos in `client/public/avatars/` (about 650 KB each), kept because the app serves them.

## 4. First push

The folder is already a repository with full history. Do not run `git init`, and don't create a README commit on GitHub. Create an **empty private** repository, then from the project folder (or from `hm-rewrite` after option A):

```text
git remote add origin https://github.com/<OWNER>/<REPO>.git
git push -u origin main
```

Push other branches only if you want them on GitHub, for example `git push -u origin docs/neon`.

## 5. GitHub checklist (only the repository owner can do these)

1. The repository is **private** (Settings → General → Danger Zone shows "Change visibility: currently private").
2. The Claude GitHub integration is installed for this repository with **write** access (contents and pull requests), so the weekly routine can open PRs.
3. Branch protection on `main`: require a pull request before merging, no direct pushes, no force pushes, no deletion.
4. When the routine opens its first PR, read the diff and the test results before merging. Never enable auto-merge for it.
