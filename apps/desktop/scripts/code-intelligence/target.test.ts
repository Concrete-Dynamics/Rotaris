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
import { interpreterKey, parseTarget, pinsHashInput, uvAssetFor } from './target.mjs';

const PINS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pins.json'), 'utf8')) as {
  python: string; distribution: string; version: string;
  uv: { version: string; assets: Record<string, { file: string; sha256: string }> };
};
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

describe('parseTarget — the artifact the bundle is for, never by default the build host', () => {
  it('names the host when no target is given: the development tree runs on it', () => {
    expect(parseTarget([], { platform: 'win32', arch: 'arm64' })).toEqual({ platform: 'win32', arch: 'arm64', key: 'win32-arm64' });
    expect(parseTarget(['--force'], { platform: 'linux', arch: 'x64' })).toEqual({ platform: 'linux', arch: 'x64', key: 'linux-x64' });
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

describe("pinsHashInput — the marker's hash changes with the target's architecture", () => {
  it('two targets of one system hash apart, so a tree built for the other is stale and --check says so', () => {
    const x64 = hash(pinsHashInput(PINS, 4, { arch: 'x64' }));
    const arm64 = hash(pinsHashInput(PINS, 4, { arch: 'arm64' }));
    expect(x64).not.toBe(arm64);
    expect(hash(pinsHashInput(PINS, 4, { arch: 'x64' }))).toBe(x64);
  });
  it('carries every pin it hashed before, and the recipe', () => {
    expect(JSON.parse(pinsHashInput(PINS, 4, { arch: 'x64' }))).toEqual({ python: PINS.python, distribution: PINS.distribution, version: PINS.version, uv: PINS.uv.version, recipe: 4, targetArch: 'x64' });
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
