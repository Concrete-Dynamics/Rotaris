#!/usr/bin/env node
// @ts-check
// `pnpm deps:audit:runtime` — `pnpm audit --json | node tools/runtime-audit/cli.mjs`: fails CI's gate when the shipped
// runtime (Electron, a devDependency the production audit cannot see) sits inside a high or critical advisory. What it
// reads and why: `runtime-audit.mjs`.
//
// Exit codes: 0 none found; 1 a finding, one line each; 2 the input is not an audit report (the registry unreachable,
// an empty pipe), which never passes.

import { describeFinding, runtimeFindings, SHIPPED_RUNTIME } from './runtime-audit.mjs';

const level = process.argv[2] ?? 'high';
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

let findings;
try {
  findings = runtimeFindings(JSON.parse(input), { level });
} catch (error) {
  process.stderr.write(`error: the shipped runtime's audit read no report: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
if (findings.length === 0) {
  process.stdout.write(`shipped runtime (${SHIPPED_RUNTIME.join(', ')}): no advisory at ${level} or above\n`);
  process.exit(0);
}
process.stderr.write(`shipped runtime (${SHIPPED_RUNTIME.join(', ')}): ${findings.length} advisor${findings.length === 1 ? 'y' : 'ies'} at ${level} or above\n`);
for (const f of findings) process.stderr.write(`  ${describeFinding(f)}\n`);
process.exit(1);
