import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MANIFEST_FILE, inventory, verifyEvidenceManifest, writeEvidenceManifest } from './evidence-manifest.mjs';

const made = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-manifest-'));
  made.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const digest = (text) => createHash('sha256').update(text).digest('hex');
const environment = { platform: 'win32', marker: 'pinned' };

describe('evidence manifest — the inventory', () => {
  it('lists every regular file with its bytes and sha256, forward-slashed and sorted, never the manifest itself', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'b.txt'), 'hello\n');
    writeFileSync(join(dir, MANIFEST_FILE), '{"an":"old manifest"}');
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, 'nested', 'a.txt'), '');
    expect(inventory(dir)).toEqual([
      { path: 'b.txt', bytes: 6, sha256: digest('hello\n') },
      { path: 'nested/a.txt', bytes: 0, sha256: digest('') },
    ]);
  });

  it('leaves an explicitly excluded path out', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'keep.txt'), 'k');
    writeFileSync(join(dir, 'drop.log'), 'd');
    expect(inventory(dir, { exclude: ['drop.log'] }).map((file) => file.path)).toEqual(['keep.txt']);
  });
});

describe('evidence manifest — writing and verifying', () => {
  it('writes the kind, the label, the environment it is given and a list of its own bytes', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'results.json'), '{"passed":true}');
    writeFileSync(join(dir, 'app.log'), 'a log\n');
    const manifest = writeEvidenceManifest(dir, { kind: 'live-run', label: 'katalyst · ask', environment, now: () => '2026-10-19T00:00:00.000Z' });
    expect(manifest).toMatchObject({ version: 1, kind: 'live-run', label: 'katalyst · ask', generatedAt: '2026-10-19T00:00:00.000Z', environment });
    expect(manifest.artifacts.map((file) => file.path)).toEqual(['app.log', 'results.json']);
    expect(JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8'))).toEqual(manifest);
    expect(verifyEvidenceManifest(dir)).toMatchObject({ ok: true, absent: false, files: 2, problems: [] });
  });

  it('names a changed file, a missing file and one the manifest never saw', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'changed.txt'), 'before');
    writeFileSync(join(dir, 'removed.txt'), 'here');
    writeEvidenceManifest(dir, { environment });
    writeFileSync(join(dir, 'changed.txt'), 'after');
    rmSync(join(dir, 'removed.txt'));
    writeFileSync(join(dir, 'added.txt'), 'new');
    const result = verifyEvidenceManifest(dir);
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(3);
    expect(result.problems[0]).toContain('changed: changed.txt');
    expect(result.problems[1]).toContain('missing: removed.txt');
    expect(result.problems[2]).toContain('not in the manifest: added.txt');
  });

  it('a directory without a manifest has nothing to verify, and says how to write one', () => {
    const result = verifyEvidenceManifest(scratch());
    expect(result).toMatchObject({ ok: false, absent: true, files: 0 });
    expect(result.problems[0]).toContain('pnpm evidence write');
  });

  it('a manifest of another shape is refused rather than half-read', () => {
    const dir = scratch();
    writeFileSync(join(dir, MANIFEST_FILE), '{"version":2,"artifacts":[]}');
    const refused = verifyEvidenceManifest(dir);
    expect(refused.ok).toBe(false);
    expect(refused.problems[0]).toContain('version 1');
    writeFileSync(join(dir, MANIFEST_FILE), 'not json');
    expect(verifyEvidenceManifest(dir).problems[0]).toContain('does not parse');
  });

  it('a second write describes the bytes as they are now — the earlier hashes are gone by design', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'a.txt'), 'one');
    writeEvidenceManifest(dir, { environment });
    writeFileSync(join(dir, 'a.txt'), 'two');
    writeEvidenceManifest(dir, { environment });
    expect(verifyEvidenceManifest(dir).ok).toBe(true);
  });
});
