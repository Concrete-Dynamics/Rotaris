#!/usr/bin/env node
/**
 * `pnpm release:guard <tag>` — the pre-build guard of REQ-STARTUP-028 (plan §4.1, ADR-0054). The tag workflow runs it
 * first, before any platform's job; exit 1 stops every one of them (REQ-STARTUP-149).
 *
 * This file only boots the guard. The guard is TypeScript (`src/guard.ts`) because its package-pin half reads the
 * built-in default configuration as the product defines it — `SHIPPED_MCP_SERVERS` and the product's own command
 * resolution, from `@rotaris/config`'s source — and that source is not loadable by Node's type stripping (it uses
 * parameter properties). It is loaded through Vite's module runner (`runnerImport`, marked experimental by Vite and
 * pinned by the lockfile), the compiler the desktop build itself runs on through electron-vite. `guard.test.ts` runs
 * this file, so a change in that API fails `pnpm check` rather than a release.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

let code;
try {
  const { module } = await runnerImport(join(HERE, 'src', 'guard.ts'), { configFile: false, logLevel: 'silent', root: REPO });
  code = module.guardCommandLine(process.argv.slice(2), REPO, {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
} catch (cause) {
  process.stderr.write(`error: the release guard could not run, so nothing may be built (REQ-STARTUP-028): ${cause && cause.stack ? cause.stack : cause}\n`);
  code = 1;
}
process.exitCode = code;
