#!/usr/bin/env node
// @ts-check
// `pnpm build-id` — writes REQ-SHELL-140's build identifier to `apps/desktop/resources/build-id.txt` (git-ignored; the
// packaging step carries it to the root of `process.resourcesPath`). `pnpm package` runs it before freezing.
//
// Exit codes are the pipeline's (REQ-STARTUP-149): 0 written; 1 a handled error — the identifier cannot be read, one
// `error: …` line says why, and no file is left behind; 2 a usage error. What the identifier is: `build-id.mjs`.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuildIdStep } from './build-id.mjs';

const args = process.argv.slice(2);
if (args.length > 0) {
  process.stderr.write(`error: pnpm build-id takes no arguments (got ${args.join(' ')})\n`);
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { code, stdout, stderr } = runBuildIdStep({ root });
for (const line of stdout) process.stdout.write(`${line}\n`);
for (const line of stderr) process.stderr.write(`${line}\n`);
process.exit(code);
