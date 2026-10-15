/**
 * The target architecture of the bundled code-intelligence runtime (OQ-400, ruled 2026-10-15 under R-072; ADR-0035,
 * ADR-0054; REQ-STARTUP-015, REQ-STARTUP-159). Pure helpers `bundle.mjs` reads; `target.test.ts` beside them.
 *
 * The bundle is built for the ARTIFACT's architecture, never by default for the host's: `uv python install` with the bare
 * version picks an interpreter for the machine uv runs on, so on a Windows ARM64 host it would put an arm64 `python.exe`
 * into the `windows-x64` artifact, and nothing at packaging could tell
 * (`docs/defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`). The target is
 * named by `--target=<platform>-<arch>`; the development tree defaults to the host, `package.mjs` passes `win32-x64`. The
 * interpreter is installed by its full uv key, the target's architecture is in the marker and in the pins' hash, and
 * `build-hooks.cjs`'s `checkRuntime` refuses a packaged interpreter whose PE machine field is not the artifact's.
 */

/** The targets a bundle is built for, each with the uv download key of its interpreter (`<os>-<arch>-<libc>`). */
export const TARGETS = {
  'win32-x64': 'windows-x86_64-none',
  'win32-arm64': 'windows-aarch64-none',
  'linux-x64': 'linux-x86_64-gnu',
  'linux-arm64': 'linux-aarch64-gnu',
};

/**
 * The target `argv` names (`--target=<platform>-<arch>`), else the host's. Returns `{ platform, arch, key }`, or
 * `{ error }` for a target no bundle is built for and for one of another operating system than the host's: the step runs the
 * interpreter it installs (pip, compileall, the evidence), so it builds only for its own operating system. Another
 * architecture of the same system is allowed where the system runs it (Windows 11 ARM64 runs x64 executables).
 */
export function parseTarget(argv, host) {
  const named = argv.find((a) => a.startsWith('--target='));
  const key = named === undefined ? `${host.platform}-${host.arch}` : named.slice('--target='.length);
  if (!(key in TARGETS)) return { error: `no bundle is built for the target ${key}; one of ${Object.keys(TARGETS).join(', ')}` };
  const [platform, arch] = key.split('-');
  if (platform !== host.platform) return { error: `the target ${key} is another operating system than this host's (${host.platform}); the step runs the interpreter it installs, so it builds for its own system only` };
  return { platform, arch, key };
}

/** The full uv key of the pinned interpreter for a target — `cpython-3.13.15-windows-x86_64-none` — so uv never picks by the host. */
export function interpreterKey(pythonPin, target) {
  return `cpython-${pythonPin}-${TARGETS[target.key]}`;
}

/** What the marker's hash is over: the pins, the recipe and the target's architecture, so a tree built for another one is stale. */
export function pinsHashInput(pins, recipe, target) {
  return JSON.stringify({ python: pins.python, distribution: pins.distribution, version: pins.version, uv: pins.uv.version, recipe, targetArch: target.arch });
}

/**
 * The pinned uv asset for the HOST uv runs on (uv is a build tool, never shipped). `win32-arm64` has no pin of its own
 * (OQ-400 (c)): it takes the pinned, hash-checked `win32-x64` asset, which the operating system runs under its x64
 * emulation. Returns `{ key, asset, emulated }`, or `{ error }` when no asset serves the host.
 */
export function uvAssetFor(uvPins, hostKey) {
  if (uvPins.assets[hostKey]) return { key: hostKey, asset: uvPins.assets[hostKey], emulated: false };
  if (hostKey === 'win32-arm64' && uvPins.assets['win32-x64']) return { key: 'win32-x64', asset: uvPins.assets['win32-x64'], emulated: true };
  return { error: `no uv asset pinned for ${hostKey}` };
}
