import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPipelineCommand } from './cli.mjs';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { assemblePortable, TOKEN_SLOT_BYTES, TOKEN_SLOT_MAGIC } from '../../apps/desktop/scripts/lib/portable.mjs';
import { keyFingerprint, keyRecordRow } from './signing.mjs';

/**
 * `pnpm release:pipeline` — the tag workflow's stages, run as the workflow runs them, over a release directory of
 * stand-in artifacts and a key pair generated for the case (REQ-STARTUP-149's exit codes: 0, 1, 2).
 */

const SETUP = 'Rotaris-0.2.0-windows-x64-setup.exe';
const PORTABLE = 'Rotaris-0.2.0-windows-x64-portable.exe';

let dir: string;
let lines: { out: string[]; err: string[] };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'release-cli-'));
  lines = { out: [], err: [] };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string, privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string };
}

function recordFile(releases: { version: string; keys: string[] }[]) {
  const path = join(dir, 'key-record.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, releases }));
  return path;
}

function run(argv: string[], options: Parameters<typeof runPipelineCommand>[1] = {}) {
  return runPipelineCommand(argv, { out: (l) => lines.out.push(l), err: (l) => lines.err.push(l), ...options });
}

function release() {
  const assets = join(dir, 'assets');
  mkdirSync(assets);
  writeFileSync(join(assets, SETUP), 'setup');
  writeFileSync(join(assets, PORTABLE), 'portable');
  return assets;
}

/** A portable assembled the way `pnpm package` assembles one, around a stand-in stub, into `<dir>/packaged/`. */
async function packagedPortable(version = '0.2.0', entry = 'Rotaris.exe') {
  const payload = join(dir, 'payload');
  mkdirSync(join(payload, 'resources'), { recursive: true });
  writeFileSync(join(payload, entry), 'MZ the application');
  writeFileSync(join(payload, 'resources', 'app.asar'), 'asar');
  const stub = join(dir, 'stub');
  writeFileSync(stub, Buffer.concat([Buffer.from('MZ stand-in stub '), TOKEN_SLOT_MAGIC, Buffer.alloc(TOKEN_SLOT_BYTES - TOKEN_SLOT_MAGIC.length)]));
  const packaged = join(dir, 'packaged');
  mkdirSync(packaged, { recursive: true });
  await assemblePortable({ stub, tree: payload, entry, version, out: join(packaged, `Rotaris-${version}-windows-x64-portable.exe`) });
  return packaged;
}

describe('the stages in the workflow\'s order', () => {
  it('preflight → portable → manifest → sign → verify, end to end with a generated key', async () => {
    const key = pair();
    const keys = [key.publicPem];
    const fp = keyFingerprint(key.publicPem);
    const keyRecord = recordFile([{ version: '0.1.0', keys: [fp] }, { version: '0.2.0', keys: [fp] }]);
    const assets = release();
    rmSync(join(assets, PORTABLE));
    const portableDir = await packagedPortable();
    expect(run(['preflight', 'v0.2.0'], { keyRecord, keys })).toBe(0);
    expect(run(['portable', assets, 'v0.2.0'], { portableDir })).toBe(0);
    expect(readFileSync(join(assets, PORTABLE)).equals(readFileSync(join(portableDir, PORTABLE)))).toBe(true);
    expect(run(['manifest', assets, 'v0.2.0'])).toBe(0);
    expect(run(['sign', assets], { env: { ROTARIS_RELEASE_SIGNING_KEY: key.privatePem } })).toBe(0);
    expect(readFileSync(join(assets, 'SHA256SUMS.txt.sig')).byteLength).toBe(64);
    expect(run(['verify', assets, 'v0.2.0'], { keyRecord, keys })).toBe(0);
    expect(lines.err).toEqual([]);
  });

  it('body writes the body and the metadata the draft is created from', () => {
    const assets = release();
    run(['manifest', assets, 'v0.2.0']);
    spawnSync('git', ['init', '-q', dir]);
    expect(run(['body', assets, 'v0.2.0', join(dir, 'out')], { repo: dir })).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, 'out', 'release.json'), 'utf8'))).toEqual({ tag: 'v0.2.0', version: '0.2.0', name: 'Rotaris 0.2.0', prerelease: false });
    const text = readFileSync(join(dir, 'out', 'release-body.md'), 'utf8');
    expect(text.startsWith('## Rotaris 0.2.0\n')).toBe(true);
    expect(text).toContain(`| \`${SETUP}\` |`);
    expect(text).toContain('First release — no previous tag to compare against.');
  });
});

describe('each stage refuses on its own', () => {
  it('preflight refuses a build that carries no key (O-2) and a record with no row for the version', () => {
    expect(run(['preflight', 'v0.1.0'], { keyRecord: recordFile([]), keys: [] })).toBe(1);
    expect(lines.err).toHaveLength(2);
    expect(lines.err[0]).toMatch(/^error: REQ-STARTUP-167: this build carries no release verification key/);
  });

  it('a tag outside the grammar is a refusal naming it, before anything is read', () => {
    expect(run(['preflight', 'v0.2.0-rc1'])).toBe(1);
    expect(lines.err).toEqual(['error: "v0.2.0-rc1" is not a release tag: expected v<major>.<minor>.<patch>, optionally followed by a prerelease suffix a<N>, b<N> or rc<N> (for example v1.2.3 or v1.2.3rc1).']);
  });

  it('portable refuses when pnpm package assembled none (§4.5)', () => {
    const assets = release();
    rmSync(join(assets, PORTABLE));
    expect(run(['portable', assets, 'v0.2.0'], { portableDir: join(dir, 'nowhere') })).toBe(1);
    expect(lines.err[0]).toMatch(/is not in .* and `pnpm package` assembled none at .*Rotaris-0\.2\.0-windows-x64-portable\.exe \(ADR-0054 P4/);
  });

  it('portable refuses a file by the portable\'s name that is not an assembled portable, and one of another version', async () => {
    const assets = release();
    expect(run(['portable', assets, 'v0.2.0'])).toBe(1);
    expect(lines.err[0]).toMatch(/is not an assembled portable: .*no portable footer/);
    rmSync(join(assets, PORTABLE));
    const other = await packagedPortable('0.1.9');
    const renamed = join(dir, 'renamed');
    mkdirSync(renamed);
    writeFileSync(join(renamed, PORTABLE), readFileSync(join(other, 'Rotaris-0.1.9-windows-x64-portable.exe')));
    expect(run(['portable', assets, 'v0.2.0'], { portableDir: renamed })).toBe(1);
    expect(lines.err[1]).toMatch(/carries 0\.1\.9-[0-9a-f]{16} with entry point Rotaris\.exe; the release of 0\.2\.0 needs/);
    expect(existsSync(join(assets, PORTABLE))).toBe(false);
  });

  it('sign refuses without the secret, naming O-2, and writes nothing', () => {
    const assets = release();
    run(['manifest', assets, 'v0.2.0']);
    expect(run(['sign', assets], { env: {} })).toBe(1);
    expect(run(['sign', assets], { env: { ROTARIS_RELEASE_SIGNING_KEY: '  ' } })).toBe(1);
    expect(lines.err[0]).toMatch(/^error: ROTARIS_RELEASE_SIGNING_KEY is not set: the release signing key \(O-2/);
    expect(existsSync(join(assets, 'SHA256SUMS.txt.sig'))).toBe(false);
  });

  it('verify refuses an unsigned release, and one signed by a key the build does not carry', () => {
    const key = pair();
    const other = pair();
    const keyRecord = recordFile([]);
    const assets = release();
    run(['manifest', assets, 'v0.2.0']);
    expect(run(['verify', assets, 'v0.2.0'], { keyRecord, keys: [key.publicPem] })).toBe(1);
    expect(lines.err.at(-1)).toMatch(/SHA256SUMS\.txt\.sig is missing/);
    run(['sign', assets], { env: { ROTARIS_RELEASE_SIGNING_KEY: other.privatePem } });
    expect(run(['verify', assets, 'v0.2.0'], { keyRecord, keys: [key.publicPem] })).toBe(1);
    expect(lines.err.at(-1)).toBe('error: REQ-STARTUP-167: SHA256SUMS.txt.sig does not verify: no key this build carries verifies it');
  });

  it('verify refuses an asset altered after signing, without reaching the signature', () => {
    const key = pair();
    const assets = release();
    run(['manifest', assets, 'v0.2.0']);
    run(['sign', assets], { env: { ROTARIS_RELEASE_SIGNING_KEY: key.privatePem } });
    writeFileSync(join(assets, SETUP), 'tampered');
    expect(run(['verify', assets, 'v0.2.0'], { keyRecord: recordFile([]), keys: [key.publicPem] })).toBe(1);
    expect(lines.err).toEqual([`error: REQ-STARTUP-032: the digest SHA256SUMS.txt lists for ${SETUP} does not match the file`]);
  });

  it('a malformed key record refuses the stage that reads it', () => {
    const path = join(dir, 'key-record.json');
    writeFileSync(path, '{"schemaVersion":2,"releases":[]}');
    expect(run(['preflight', 'v0.2.0'], { keyRecord: path })).toBe(1);
    expect(lines.err).toEqual([`error: ${path}: schemaVersion is 2, not 1`]);
  });

  it('a usage error exits 2', () => {
    expect(run([])).toBe(2);
    expect(run(['manifest', dir])).toBe(2);
    expect(run(['keys', '0.1.0', 'extra'])).toBe(2);
    expect(lines.err.every((l) => l.startsWith('usage: pnpm release:pipeline'))).toBe(true);
  });
});

describe('the bare command', () => {
  it('runs under plain Node with nothing but the repository — the signing job installs no dependency', () => {
    const r = spawnSync(process.execPath, [join(__dirname, 'cli.mjs'), 'keys', '0.1.0'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(keyRecordRow('0.1.0'));
  });

  it('keys with no argument reads the declared version', () => {
    expect(run(['keys'])).toBe(0);
    const declared = JSON.parse(readFileSync(join(__dirname, '..', '..', 'apps', 'desktop', 'package.json'), 'utf8')).version;
    expect(JSON.parse(lines.out[0]!)).toEqual(keyRecordRow(declared));
  });
});
