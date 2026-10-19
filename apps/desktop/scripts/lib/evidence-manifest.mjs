// @ts-check
// The evidence manifest: what machine and build produced a directory of evidence, and a sha256 for every file
// in it. `pnpm evidence write <dir>` writes one; `pnpm evidence verify <dir>` re-hashes the directory against it.
//
// Evidence outlives the run that made it: an autopsy reads a pack months later, a defect report cites it, and
// "was this pack changed after it was written?" had no answer that did not trust the reader. The manifest
// answers it, and answers "which platform, which Electron, which commit and which build produced it" beside
// it — the facts `lib/environment-facts.mjs` reads once for the preflight and once here.
//
// It is `evidence-manifest.json`, never `manifest.json`: a `pnpm ui-review` pack's `manifest.json` is the critic
// protocol's own (revision, iteration, the files it holds), and this tool neither writes nor reads it.
//
// The manifest describes the directory AS IT STOOD WHEN WRITTEN. Verification compares the files against it and
// nothing else: the repository will have moved on by the time a pack is verified, so the recorded git head is a
// fact about the pack, never an assertion about the tree now.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { environmentFacts } from './environment-facts.mjs';

export const MANIFEST_FILE = 'evidence-manifest.json';
export const MANIFEST_VERSION = 1;

/** A file's sha256, read in chunks so a store of fifty megabytes is not loaded whole to be hashed. */
function sha256File(file) {
  const hash = createHash('sha256');
  const fd = openSync(file, 'r');
  try {
    const chunk = Buffer.allocUnsafe(1 << 20);
    let read;
    while ((read = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, read));
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * Every regular file under `dir` as `{ path, bytes, sha256 }` — the path relative and forward-slashed, sorted by
 * path so two inventories of the same bytes are the same list. `exclude` names relative paths that are not the
 * evidence; the manifest never lists itself. A symlink or a special file is skipped: it has no bytes of its own
 * that a later verification could hold.
 * @param {string} dir
 * @param {{ exclude?: string[] }} [opts]
 */
export function inventory(dir, { exclude = [] } = {}) {
  const excluded = new Set([MANIFEST_FILE, ...exclude]);
  /** @type {Array<{ path: string, bytes: number, sha256: string }>} */
  const files = [];
  /** @param {string} current */
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) { visit(path); continue; }
      if (!entry.isFile()) continue;
      const rel = relative(dir, path).split(sep).join('/');
      if (excluded.has(rel)) continue;
      files.push({ path: rel, bytes: statSync(path).size, sha256: sha256File(path) });
    }
  };
  visit(dir);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Write `<dir>/evidence-manifest.json` over the directory as it stands now, and return the manifest written.
 * `environment` is injectable so a test can pin the block; a caller that writes real evidence takes the default.
 * @param {string} dir
 * @param {{ kind?: string, label?: string | null, environment?: object, now?: () => string }} [opts]
 */
export function writeEvidenceManifest(dir, { kind = 'pack', label = null, environment = environmentFacts(), now = () => new Date().toISOString() } = {}) {
  const manifest = {
    version: MANIFEST_VERSION,
    kind,
    label,
    generatedAt: now(),
    environment,
    artifacts: inventory(dir),
  };
  writeFileSync(join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * Re-hash `dir` against its manifest. `problems` is empty exactly when every file the manifest names is present
 * with the bytes it recorded and the directory holds no file the manifest does not name.
 *
 * `absent` separates "there is nothing to verify" (exit 2 for the caller: a usage error) from "the directory
 * does not match what was recorded" (exit 1: the pack is not as it was written).
 * @param {string} dir
 */
export function verifyEvidenceManifest(dir) {
  const file = join(dir, MANIFEST_FILE);
  if (!existsSync(file)) {
    return { ok: false, absent: true, manifest: null, files: 0, bytes: 0, problems: [`no ${MANIFEST_FILE} in ${dir} — write one with \`pnpm evidence write <dir>\``] };
  }
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    return { ok: false, absent: false, manifest: null, files: 0, bytes: 0, problems: [`the manifest does not parse: ${cause instanceof Error ? cause.message : String(cause)}`] };
  }
  if (manifest?.version !== MANIFEST_VERSION || !Array.isArray(manifest?.artifacts)) {
    return { ok: false, absent: false, manifest, files: 0, bytes: 0, problems: [`the manifest is not version ${MANIFEST_VERSION} with an \`artifacts\` list — another tool wrote it, or a newer pnpm evidence`] };
  }
  const onDisk = inventory(dir);
  const unclaimed = new Map(onDisk.map((artifact) => [artifact.path, artifact]));
  /** @type {string[]} */
  const problems = [];
  for (const artifact of manifest.artifacts) {
    const found = unclaimed.get(artifact.path);
    if (found === undefined) {
      problems.push(`missing: ${artifact.path} (the manifest recorded ${artifact.bytes} bytes, sha256 ${String(artifact.sha256).slice(0, 12)}…)`);
      continue;
    }
    unclaimed.delete(artifact.path);
    if (found.bytes !== artifact.bytes || found.sha256 !== artifact.sha256) {
      problems.push(`changed: ${artifact.path} (${artifact.bytes} bytes, sha256 ${String(artifact.sha256).slice(0, 12)}… recorded; ${found.bytes} bytes, sha256 ${found.sha256.slice(0, 12)}… now)`);
    }
  }
  for (const extra of unclaimed.values()) problems.push(`not in the manifest: ${extra.path} (${extra.bytes} bytes, sha256 ${extra.sha256.slice(0, 12)}…)`);
  return {
    ok: problems.length === 0,
    absent: false,
    manifest,
    files: onDisk.length,
    bytes: onDisk.reduce((total, artifact) => total + artifact.bytes, 0),
    problems,
  };
}
