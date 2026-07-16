#!/usr/bin/env node
/*
 * Points git's hooksPath at the committed .githooks/ directory so the CLAUDE.md
 * map hook runs for every developer after `pnpm install` (web/ runs this via its
 * `prepare` script). Safe no-op outside a git checkout — e.g. Docker builds,
 * where there is no .git — so it never breaks an install.
 */
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
// execFileSync (no shell) with fixed argument arrays — no interpolation, no injection surface.
const git = (...args) => execFileSync('git', args, { cwd: repoRoot, stdio: 'ignore' })

try {
  git('rev-parse', '--is-inside-work-tree')
  git('config', 'core.hooksPath', '.githooks')
  console.log('[setup-hooks] core.hooksPath -> .githooks')
} catch {
  // Not a git checkout (or git unavailable) — nothing to wire up.
}
