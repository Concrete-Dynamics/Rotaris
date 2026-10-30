/**
 * Renders the human proof index (`docs/proofs/README.md`) from the registry.
 *
 *   node tools/proof-registry/generate.mjs --write     # `pnpm proofs:index`
 *   node tools/proof-registry/generate.mjs --check     # what `pnpm lint` runs
 *
 * The index is generated, so it cannot drift from the registry that agents and the verification planner read:
 * `--check` fails when the file on disk is not what `render()` produces, naming it and the first line that differs.
 * The detailed record of each proof — what it measures, version by version — is hand-written under `docs/proofs/`
 * and is never touched by this script.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AREAS, HOSTS, INDEX_PATH, PROOFS, recordPath } from './registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A table cell: one line, and a pipe written so it does not split the row. */
const cell = (value) => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const dash = (value) => (value === '' ? '—' : value);

const platformsOf = (proof) => {
  const all = HOSTS.every((host) => proof.platforms.includes(host));
  const hosts = all ? 'all hosts' : proof.platforms.join(', ');
  if (proof.platformNotes.length === 0) return hosts;
  return `${hosts} — ${proof.platformNotes.join('; ')}`;
};

const flagsOf = (proof) => proof.flags.map((flag) => `\`${flag}\``).join(', ');
const neighboursOf = (proof) => proof.neighbours.map((id) => `\`${id}\``).join(', ');
const requiresOf = (proof) => proof.requires.join('; ');
const recordLinkOf = (proof) => recordPath(proof.id).split('/').pop();

/** The whole index, as the file holds it. Exported so the check and the guard read the same string. */
export function render() {
  const lines = [
    '# The proof registry — which proof covers what',
    '',
    '> **Generated** by `pnpm proofs:index` from [`tools/proof-registry/registry.mjs`](../../tools/proof-registry/registry.mjs);',
    '> `pnpm lint` fails when this file is stale. Edit the registry, not this file.',
    '',
    'Every proof launches the **built** application against a scratch profile and measures a mechanism in the',
    'product rather than in a unit test. `pnpm check` — symbols, typecheck, lint, tests — is the gate every change',
    'passes before it lands; these are the evidence beside it. Two rules govern their use, stated in',
    '[`AGENTS.md`](../../AGENTS.md): run the whole suite a part touches, not the one script named after it — a change',
    'that moves a shared seam breaks a neighbour\'s proof — and treat a red as a defect of the product until the',
    'harness is shown to be wrong.',
    '',
    '`pnpm <id>` runs an entry; the flags column is what a runner may pass it, `--skip-build` reusing the current',
    'build where it stands. Unless its platform clauses say otherwise an entry runs to its end on Windows, Linux and',
    'macOS; on a headless Linux host that means a display (`xvfb-run`, the wrapper the orchestrated build uses).',
    '`live-run` is the one entry that spends real money against a metered endpoint; it is never automatic, and',
    '`slice-proof` runs on its terms. A proof\'s detailed record — what it measures, version by version — is the',
    'document its name links to.',
    '',
    '## How a proof launch is bounded',
    '',
    'No proof hangs on a launch that overruns. Every launch a script starts itself goes through',
    '`lib/bounded-launch.mjs`\'s `spawnBounded`, and a driven one through the driver\'s `stopApp`. Two launches are neither,',
    'and `lib/launch-sites.test.ts` names them with their reasons: `code-intel-proof`\'s branch, a stdio server whose RPC',
    'client fails every request when it dies or hangs, and `live-run`\'s `runElectron`, whose bound is SIGKILL reported as',
    'a signal, never as a clean exit, and whose wait settles on the main process\'s exit and a bounded drain of its pipes',
    '(`lib/settle-launch.mjs`), so a process of a killed main that keeps them open cannot hold the run past its bound. A',
    'live-run launch that overruns or exits non-zero is a failed check of its scenario, its session preserved, and the run',
    'ends through `lib/run-ending.mjs`, which writes `results.json` and the manifest whatever ends it',
    '([note](../defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md)). Any other bare',
    '`spawn` of Electron fails that test. At its bound the',
    'application is sent SIGTERM with its pipes still open, and it answers: its quit path runs and it exits within a',
    'fraction of a second. SIGKILL follows a grace only if it does not. The proof then fails with the launch\'s last log',
    'lines. `lib/launch-sites.test.ts` refuses a `spawnSync` launch of Electron: its timeout closes the pipes as it signals,',
    'so the quit path\'s lines are lost, and it reports the overrun as exit status 0 with only `error.code` `ETIMEDOUT` to',
    'show it, which a check of the status passes as a clean exit. (Before the application\'s EPIPE loop was repaired on',
    '2026-09-29 it did not return at all.)',
    '([note](../defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md)).',
    '',
    'A launch ends with its whole process group, not with its main process alone. Since 2026-10-07 a driven launch leads a',
    'process group of its own as a `spawnBounded` one does, and both drain it once the main process has exited',
    '(`drainGroup`): whatever of that group is still running three seconds later, an Electron helper or a child the app started',
    'in it, is ended with SIGKILL and named on the proof\'s standard error as `bounded-launch: … outlived it …`. Since fin34 the',
    'drain also reaches a child the app puts in a process group of its own (a project-setup step, `packages/mcp/src/setup.ts`),',
    'on Linux, by an `XDG_DATA_HOME` the launch was given in its environment (since `3c54f02` never one it inherited from the',
    'proof\'s own shell, so a launch given none is not swept this way): it is given REQ-WORKSPACE-092\'s 5 s and a second\'s margin to',
    'end by itself, then ended with SIGKILL and named as `bounded-launch: … in group(s) of their own outlived …`',
    '([note](../defects/fixed/a-proof-can-exit-while-a-setup-step-the-app-started-in-its-own-process-group-is-still-ending.md)). A proof that exits or is',
    'signalled takes every live group with it. Before that, `layout-proof`, `driver-proof` and `workspace-proof` exited beside',
    'their own zygotes and a Git view\'s `git diff`',
    '([note](../defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md)).',
    '',
  ];
  for (const area of AREAS) {
    lines.push(`## ${area}`, '');
    lines.push('| Proof | What it measures | Requires | Flags | Platforms | Neighbours |');
    lines.push('|---|---|---|---|---|---|');
    for (const proof of PROOFS.filter((entry) => entry.area === area)) {
      lines.push(
        `| [\`${proof.id}\`](${recordLinkOf(proof)}) | ${cell(proof.summary)} | ${dash(cell(requiresOf(proof)))} | ` +
          `${dash(cell(flagsOf(proof)))} | ${cell(platformsOf(proof))} | ${cell(neighboursOf(proof))} |`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The 1-based line where `current` first differs from `rendered`, or 0 when they are equal. The shorter side
 * running out is a difference too: the old blank `findIndex` read a file that is a prefix of the render (or
 * differs only by a missing trailing newline) as equal at every line and reported "first difference at line 0".
 * @param {string} current
 * @param {string} rendered
 * @returns {number}
 */
export function firstDifferingLine(current, rendered) {
  if (current === rendered) return 0;
  const a = current.split('\n');
  const b = rendered.split('\n');
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return index + 1;
  }
  return Math.max(a.length, b.length);
}

const runDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (runDirectly) {
  const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : '';
  if (mode === '') {
    process.stdout.write('usage: node tools/proof-registry/generate.mjs --write|--check\n');
    process.exit(1);
  }

  const target = join(ROOT, INDEX_PATH);
  const rendered = render();
  if (mode === 'write') {
    writeFileSync(target, rendered);
    process.stdout.write(`proof registry written: ${INDEX_PATH} (${PROOFS.length} entries)\n`);
  } else if (!existsSync(target)) {
    process.stderr.write(`proof registry missing: ${INDEX_PATH} — run pnpm proofs:index\n`);
    process.exit(1);
  } else {
    const current = readFileSync(target, 'utf8');
    if (current === rendered) {
      process.stdout.write(`proof registry is current: ${INDEX_PATH} (${PROOFS.length} entries)\n`);
    } else {
      const at = firstDifferingLine(current, rendered);
      process.stderr.write(
        `proof registry is stale: ${INDEX_PATH} (first difference at line ${at}) — run pnpm proofs:index\n`,
      );
      process.exit(1);
    }
  }
}
