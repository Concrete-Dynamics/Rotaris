#!/usr/bin/env node
// @ts-check
/**
 * `pnpm evidence write|verify <dir>` — the manifest of an evidence directory.
 *
 * Evidence outlives the run that made it: an autopsy reads a pack months later, a defect report cites it, and
 * "was this pack changed after it was written?" had no answer that did not trust the reader. `write` records the
 * machine and build that produced the directory (`lib/environment-facts.mjs`) and a sha256, byte count and path
 * for every file in it (`lib/evidence-manifest.mjs`); `verify` re-hashes the directory and reports every
 * difference, so a pack kept beside a record can be shown to be the one that was examined.
 *
 * A live run writes `evidence-manifest.json` into its pack as it finishes (the pack's row in docs/proofs/live-run.md). This
 * tool is what verifies one, and what writes one for any other evidence directory — a `.proof/` scratch tree, a
 * `pnpm ui-review` pack (whose own `manifest.json` is the critic protocol's and is not touched), a directory
 * whose contents a report cites.
 *
 * It launches nothing and talks to no provider. Usage (`pnpm evidence [flags]`):
 *   write <dir>         the manifest of the directory as it stands now
 *   verify <dir>        re-hash it and report every difference
 *   --kind=<name>       write: what the directory is evidence of (default: pack)
 *   --label=<text>      write: a one-line description, e.g. a run's endpoint and scenarios
 *   --json              the manifest (write) or the verification result (verify)
 *   --help, -h          this text
 *
 * Exit 0 when the command did what it says, 1 when a pack does not verify, 2 on a usage error — a directory
 * without a manifest to verify is one.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE, verifyEvidenceManifest, writeEvidenceManifest } from './lib/evidence-manifest.mjs';

const USAGE = `pnpm evidence write <dir> [flags]    manifest a directory as it stands now
pnpm evidence verify <dir> [--json]  re-hash it and report every difference

flags:
  --kind=<name>        write: what the directory is evidence of (default: pack)
  --label=<text>       write: a one-line description, e.g. a run's endpoint and scenarios
  --json               the manifest (write) or the verification result (verify)
  --help, -h           this text

A directory's manifest is evidence-manifest.json. A pnpm ui-review pack's manifest.json is the critic
protocol's own and is never written or read here. Exit 0 when the command did what it says, 1 when a pack does
not verify, 2 on a usage error — a directory without a manifest to verify is one.
`;

const files = (count) => `${count} file${count === 1 ? '' : 's'}`;
const describe = (manifest) => `${manifest.kind}${manifest.label ? `: ${manifest.label}` : ''}`;

/**
 * @param {string[]} args
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const positional = [];
  let json = false;
  let help = false;
  /** @type {string | null} */
  let kind = null;
  /** @type {string | null} */
  let label = null;
  /** @type {string[]} */
  const unknown = [];
  for (const a of args) {
    if (a === '--help' || a === '-h') { help = true; continue; }
    if (a === '--json') { json = true; continue; }
    if (a.startsWith('--kind=')) { kind = a.slice('--kind='.length); continue; }
    if (a.startsWith('--label=')) { label = a.slice('--label='.length); continue; }
    if (a.startsWith('-')) { unknown.push(a); continue; }
    positional.push(a);
  }
  return { command: positional[0] ?? null, dir: positional[1] ?? null, extra: positional.slice(2), kind, label, json, help, unknown };
}

/**
 * The command, returning its exit code rather than ending the process, so a test can run it.
 * @param {string[]} argv
 * @param {{ out: (text: string) => void, err: (text: string) => void }} io
 */
export function main(argv, io = { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text) }) {
  const parsed = parseArgs(argv);
  if (parsed.help) { io.out(USAGE); return 0; }
  if (parsed.unknown.length > 0) {
    io.err(`evidence: unknown argument ${parsed.unknown.join(' ')} (known: --kind= --label= --json --help)\n`);
    return 2;
  }
  if (parsed.command !== 'write' && parsed.command !== 'verify') {
    io.err(`evidence: ${parsed.command === null ? 'a command is required' : `"${parsed.command}" is not write or verify`}\n\n${USAGE}`);
    return 2;
  }
  if (parsed.dir === null) { io.err(`evidence: ${parsed.command} needs a directory\n`); return 2; }
  if (parsed.extra.length > 0) { io.err(`evidence: unexpected argument ${parsed.extra.join(' ')}\n`); return 2; }
  const dir = resolve(parsed.dir);
  if (!existsSync(dir)) { io.err(`evidence: ${dir} does not exist\n`); return 2; }
  try {
    if (parsed.command === 'write') {
      const replacing = existsSync(join(dir, MANIFEST_FILE));
      const manifest = writeEvidenceManifest(dir, { kind: parsed.kind ?? 'pack', label: parsed.label });
      if (parsed.json) { io.out(`${JSON.stringify(manifest, null, 2)}\n`); return 0; }
      const bytes = manifest.artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
      io.out(`wrote ${join(dir, MANIFEST_FILE)} — ${files(manifest.artifacts.length)}, ${bytes} bytes (${describe(manifest)})\n`);
      if (replacing) io.out('note: an earlier manifest was replaced; the hashes it held are gone\n');
      return 0;
    }
    const result = verifyEvidenceManifest(dir);
    if (parsed.json) {
      io.out(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.absent) {
      io.err(`evidence: ${result.problems[0]}\n`);
    } else if (result.ok) {
      io.out(`PASS  ${dir} verifies: ${files(result.files)}, ${result.bytes} bytes, written ${result.manifest.generatedAt} (${describe(result.manifest)})\n`);
    } else {
      for (const problem of result.problems) io.err(`FAIL  ${problem}\n`);
      io.err(`${result.problems.length} difference${result.problems.length === 1 ? '' : 's'} — the directory is not as the manifest recorded it\n`);
    }
    if (result.absent) return 2;
    return result.ok ? 0 : 1;
  } catch (cause) {
    io.err(`evidence: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 2;
  }
}

/** True when this module is the process entry; the four lines `preflight.mjs` keeps too (a relative argv[1] must resolve to match on Windows). */
function isMainModule(argv1, metaUrl = import.meta.url) {
  return argv1 !== undefined && metaUrl === pathToFileURL(resolve(argv1)).href;
}

if (isMainModule(process.argv[1])) process.exit(main(process.argv.slice(2)));
