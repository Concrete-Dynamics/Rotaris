#!/usr/bin/env node
// @ts-check
// `pnpm notices` — the notices generation and validation step (REQ-STARTUP-037, REQ-STARTUP-141..143). It runs per
// platform before freezing: it computes the shipped closure offline, validates it, and only then writes
// `apps/desktop/resources/THIRD-PARTY-LICENSES.txt` (git-ignored; the packaging step carries it into the artifact).
//
// Exit codes are the pipeline's (REQ-STARTUP-149): 0 written; 1 a handled error — every validation failure is printed
// as its own `error: …` line naming the component or path, and no file is left behind; 2 a usage error. The target
// platform is the machine's own, because the job runs on the platform it builds for; the date that decides a
// reviewed exception's expiry is today's, in UTC.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNoticesStep } from './notices.mjs';

const args = process.argv.slice(2);
if (args.length > 0) {
  process.stderr.write(`error: pnpm notices takes no arguments (got ${args.join(' ')})\n`);
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { code, stdout, stderr } = runNoticesStep({ root, platform: process.platform, today: new Date().toISOString().slice(0, 10) });
for (const line of stdout) process.stdout.write(`${line}\n`);
for (const line of stderr) process.stderr.write(`${line}\n`);
process.exit(code);
