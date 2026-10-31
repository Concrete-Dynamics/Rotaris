/**
 * The bundle's target architecture (OQ-400, ruled 2026-10-15 under R-072;
 * `docs/defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`): `bundle.mjs`
 * installs the interpreter by the target's full uv key, carries the target's architecture in the marker's hash, and on a
 * Windows ARM64 host takes the pinned `win32-x64` uv, since no `win32-arm64` uv is pinned.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultTargetKey, interpreterKey, parseClosureLock, parseTarget, pinsHashInput, uvAssetFor } from './target.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PINS = JSON.parse(readFileSync(join(HERE, 'pins.json'), 'utf8')) as {
  python: string; distribution: string; version: string;
  uv: { version: string; assets: Record<string, { file: string; sha256: string }> };
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The argument lists of every `run(uv, [...])` in `bundle.mjs`, each as its top-level elements' source text. A static
 * scan, as `lib/launch-sites.test.ts` holds the proofs' launches: running the step would download an interpreter.
 */
function uvCalls(text: string): string[][] {
  return [...text.matchAll(/\brun\(\s*uv\s*,\s*\[/g)].map((m) => {
    const out: string[] = [];
    let depth = 0;
    let start = m.index! + m[0].length;
    for (let i = start; i < text.length; i += 1) {
      const c = text[i]!;
      if (c === "'" || c === '"' || c === '`') { for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1; continue; }
      if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c) && depth > 0) depth -= 1;
      else if (c === ']' || (c === ',' && depth === 0)) {
        const element = text.slice(start, i).trim();
        if (element !== '') out.push(element);
        if (c === ']') return out;
        start = i + 1;
      }
    }
    throw new Error(`no end to the argument list at ${m.index}`);
  });
}

describe('parseTarget — the artifact the bundle is for, never by default the build host', () => {
  it('names the host when no target is given: the development tree runs on it', () => {
    expect(parseTarget(['--force'], { platform: 'linux', arch: 'x64' })).toEqual({ platform: 'linux', arch: 'x64', key: 'linux-x64' });
    expect(parseTarget([], { platform: 'win32', arch: 'x64' })).toEqual({ platform: 'win32', arch: 'x64', key: 'win32-x64' });
    expect(parseTarget([], { platform: 'linux', arch: 'arm64' })).toEqual({ platform: 'linux', arch: 'arm64', key: 'linux-arm64' });
  });
  // OQ-401 (raised 2026-10-16, the build's reading): on Windows ARM64 six dependencies have no `win_arm64` wheel and an arm64
  // bundle cannot be built without a C and a Rust compiler, so the development tree takes the artifact's `win32-x64` bundle,
  // run under emulation (docs/defects/no-code-intelligence-bundle-can-be-built-for-a-windows-arm64-development-tree.md). It
  // read `win32-arm64` until then.
  it('names win32-x64 on a Windows ARM64 host when no target is given, and still takes --target=win32-arm64 where one is named', () => {
    expect(parseTarget([], { platform: 'win32', arch: 'arm64' })).toEqual({ platform: 'win32', arch: 'x64', key: 'win32-x64' });
    expect(defaultTargetKey({ platform: 'win32', arch: 'arm64' })).toBe('win32-x64');
    expect(parseTarget(['--target=win32-arm64'], { platform: 'win32', arch: 'arm64' })).toEqual({ platform: 'win32', arch: 'arm64', key: 'win32-arm64' });
  });
  it('takes --target over the host: package.mjs builds win32-x64 on an ARM64 host', () => {
    expect(parseTarget(['--target=win32-x64'], { platform: 'win32', arch: 'arm64' })).toEqual({ platform: 'win32', arch: 'x64', key: 'win32-x64' });
  });
  it('refuses a target no bundle is built for, and one of another operating system than the host', () => {
    expect(parseTarget(['--target=darwin-arm64'], { platform: 'win32', arch: 'x64' })).toEqual({ error: expect.stringMatching(/no bundle is built for the target darwin-arm64/) });
    expect(parseTarget(['--target=win32-x64'], { platform: 'linux', arch: 'x64' })).toEqual({ error: expect.stringMatching(/another operating system than this host's \(linux\)/) });
  });
});

describe('interpreterKey — the full uv key, so uv never picks the interpreter by the host', () => {
  it('names the architecture and the libc of each target', () => {
    expect(interpreterKey('3.13.15', { key: 'win32-x64' })).toBe('cpython-3.13.15-windows-x86_64-none');
    expect(interpreterKey('3.13.15', { key: 'win32-arm64' })).toBe('cpython-3.13.15-windows-aarch64-none');
    expect(interpreterKey(PINS.python, { key: 'linux-x64' })).toBe(`cpython-${PINS.python}-linux-x86_64-gnu`);
  });
});

describe("pinsHashInput — the marker's hash changes with the target's architecture and the closure lock", () => {
  it('two targets of one system hash apart, so a tree built for the other is stale and --check says so', () => {
    const x64 = hash(pinsHashInput(PINS, 5, { arch: 'x64' }, 'a'));
    const arm64 = hash(pinsHashInput(PINS, 5, { arch: 'arm64' }, 'a'));
    expect(x64).not.toBe(arm64);
    expect(hash(pinsHashInput(PINS, 5, { arch: 'x64' }, 'a'))).toBe(x64);
  });
  it('two locks hash apart, so a tree installed from the other lock is stale', () => {
    expect(hash(pinsHashInput(PINS, 5, { arch: 'x64' }, 'a'))).not.toBe(hash(pinsHashInput(PINS, 5, { arch: 'x64' }, 'b')));
  });
  it('carries every pin it hashed before, the recipe and the lock', () => {
    expect(JSON.parse(pinsHashInput(PINS, 5, { arch: 'x64' }, 'a'))).toEqual({ python: PINS.python, distribution: PINS.distribution, version: PINS.version, uv: PINS.uv.version, recipe: 5, targetArch: 'x64', closure: 'a' });
  });
});

// REQ-STARTUP-143: the reviewed-exceptions table names exact versions, so the closure it reviews must not be resolved on the
// day of the build (docs/defects/fixed/the-code-intelligence-bundle-pins-serena-agent-and-not-its-dependencies.md).
describe('parseClosureLock — every distribution of the closure at one exact version, by hash', () => {
  const H = 'a'.repeat(64);
  it('reads name, version, marker and hashes over continuation lines, and skips comments', () => {
    const text = `# header\nclr-loader==0.3.1 ; sys_platform == 'win32' \\\n    --hash=sha256:${H} \\\n    --hash=sha256:${'b'.repeat(64)}\n    # via pythonnet\nRuamel.Yaml==0.18.14 \\\n    --hash=sha256:${H}\n`;
    expect(parseClosureLock(text)).toEqual({ entries: [
      { name: 'clr-loader', version: '0.3.1', marker: "sys_platform == 'win32'", hashes: [H, 'b'.repeat(64)] },
      { name: 'ruamel-yaml', version: '0.18.14', marker: null, hashes: [H] },
    ] });
  });
  it('refuses a range, a bare name and an unhashed pin: each would let the build resolve again', () => {
    expect(parseClosureLock(`certifi>=2026.7.22 --hash=sha256:${H}\n`)).toEqual({ error: expect.stringMatching(/not an exact, hashed pin: certifi>=2026\.7\.22/) });
    expect(parseClosureLock('certifi\n')).toEqual({ error: expect.stringMatching(/not an exact, hashed pin/) });
    expect(parseClosureLock('certifi==2026.10.23\n')).toEqual({ error: 'the closure lock pins certifi==2026.10.23 without a hash' });
    expect(parseClosureLock('# nothing\n')).toEqual({ error: 'the closure lock holds no requirement' });
  });
  it('the committed locks parse, and closure.lock pins the distribution at the pinned version, once', () => {
    const lock = parseClosureLock(readFileSync(join(HERE, 'closure.lock'), 'utf8'));
    if ('error' in lock) throw new Error(lock.error);
    expect(lock.entries.filter((e) => e.name === PINS.distribution)).toEqual([expect.objectContaining({ version: PINS.version, marker: null })]);
    expect(new Set(lock.entries.map((e) => e.name)).size).toBe(lock.entries.length);
    const build = parseClosureLock(readFileSync(join(HERE, 'closure-build.lock'), 'utf8'));
    if ('error' in build) throw new Error(build.error);
    expect(build.entries.map((e) => e.name)).toEqual(['setuptools']);
  });
});

describe('uvAssetFor — the pinned uv for the host uv runs on', () => {
  it("takes the host's own pinned asset where one exists", () => {
    expect(uvAssetFor(PINS.uv, 'win32-x64')).toEqual({ key: 'win32-x64', asset: PINS.uv.assets['win32-x64'], emulated: false });
    expect(uvAssetFor(PINS.uv, 'linux-x64')).toEqual({ key: 'linux-x64', asset: PINS.uv.assets['linux-x64'], emulated: false });
  });
  it('on win32-arm64, with no asset of its own pinned, takes the pinned win32-x64 asset by its hash, under emulation', () => {
    expect(PINS.uv.assets['win32-arm64']).toBeUndefined();
    const got = uvAssetFor(PINS.uv, 'win32-arm64');
    expect(got).toEqual({ key: 'win32-x64', asset: PINS.uv.assets['win32-x64'], emulated: true });
    expect('asset' in got && got.asset.sha256).toBe(PINS.uv.assets['win32-x64']!.sha256);
  });
  it('a host with neither its own pin nor that fallback is refused', () => {
    expect(uvAssetFor(PINS.uv, 'linux-arm64')).toEqual({ error: 'no uv asset pinned for linux-arm64' });
    expect(uvAssetFor({ version: '0', assets: {} }, 'win32-arm64')).toEqual({ error: 'no uv asset pinned for win32-arm64' });
  });
});

// docs/defects/fixed/the-bundle-steps-python-install-tries-to-place-an-interpreter-on-the-users-path.md: `--install-dir`
// moves where uv keeps the interpreter, not its executable links, so without `--no-bin` the step also wrote a
// `python3.13` into the user's `~/.local/bin`, on PATH, outside the tree — on the Linux host one was left dangling once
// its worktree was removed (2026-10-31).
describe("bundle.mjs's interpreter install — nothing onto the user's PATH", () => {
  const calls = uvCalls(readFileSync(join(HERE, 'bundle.mjs'), 'utf8'));
  const installs = calls.filter((args) => args[0] === "'python'" && args[1] === "'install'");
  it('finds the one `uv python install` the bundle runs, into the tree by --install-dir', () => {
    expect(calls.length).toBeGreaterThan(1);
    expect(installs).toHaveLength(1);
    expect(installs[0]).toContain("'--install-dir'");
  });
  it('passes --no-bin on that same call, so uv installs no executable into its bin directory', () => {
    expect(installs[0]).toContain("'--no-bin'");
  });
});
