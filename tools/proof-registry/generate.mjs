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
