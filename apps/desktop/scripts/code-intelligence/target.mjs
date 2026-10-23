/**
 * The target architecture of the bundled code-intelligence runtime (OQ-400, ruled 2026-10-15 under R-072; ADR-0035,
 * ADR-0054; REQ-STARTUP-015, REQ-STARTUP-159). Pure helpers `bundle.mjs` reads; `target.test.ts` beside them.
 *
 * The bundle is built for the ARTIFACT's architecture, never by default for the host's: `uv python install` with the bare
 * version picks an interpreter for the machine uv runs on, so on a Windows ARM64 host it would put an arm64 `python.exe`
 * into the `windows-x64` artifact, and nothing at packaging could tell
 * (`docs/defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`). The target is
 * named by `--target=<platform>-<arch>`; the development tree defaults to the host (to `win32-x64` on a Windows ARM64 host, OQ-401), `package.mjs` passes `win32-x64`. The
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
 * The target `argv` names (`--target=<platform>-<arch>`), else `defaultTargetKey`'s (the host's, `win32-x64` on Windows ARM64). Returns `{ platform, arch, key }`, or
 * `{ error }` for a target no bundle is built for and for one of another operating system than the host's: the step runs the
 * interpreter it installs (pip, compileall, the evidence), so it builds only for its own operating system. Another
 * architecture of the same system is allowed where the system runs it (Windows 11 ARM64 runs x64 executables).
 */
export function parseTarget(argv, host) {
  const named = argv.find((a) => a.startsWith('--target='));
  const key = named === undefined ? defaultTargetKey(host) : named.slice('--target='.length);
  if (!(key in TARGETS)) return { error: `no bundle is built for the target ${key}; one of ${Object.keys(TARGETS).join(', ')}` };
  const [platform, arch] = key.split('-');
  if (platform !== host.platform) return { error: `the target ${key} is another operating system than this host's (${host.platform}); the step runs the interpreter it installs, so it builds for its own system only` };
  return { platform, arch, key };
}

/**
 * The target a development tree's bundle is built for when none is named: the host's own, except on Windows ARM64, where it
 * is `win32-x64` (OQ-401, raised 2026-10-16, the build's reading until it is ruled). Six of the distribution's dependencies
 * publish no `win_arm64` wheel and need a C or a Rust compiler to build, so no arm64 bundle could be made there, and every check
 * that needs one refused (docs/defects/no-code-intelligence-bundle-can-be-built-for-a-windows-arm64-development-tree.md); the
 * x64 bundle builds from wheels and Windows runs it under its x64 emulation, as it runs the pinned `win32-x64` uv. FALSIFIED,
 * kept beside its replacement: "the development tree defaults to the host" (fin47, OQ-400), which on that host left no bundle.
 */
export function defaultTargetKey(host) {
  return host.platform === 'win32' && host.arch === 'arm64' ? 'win32-x64' : `${host.platform}-${host.arch}`;
}

/** The full uv key of the pinned interpreter for a target — `cpython-3.13.15-windows-x86_64-none` — so uv never picks by the host. */
export function interpreterKey(pythonPin, target) {
  return `cpython-${pythonPin}-${TARGETS[target.key]}`;
}

/**
 * What the marker's hash is over: the pins, the recipe, the target's architecture and the closure lock's sha256, so a tree
 * built for another architecture, or from another lock, is stale.
 */
export function pinsHashInput(pins, recipe, target, closureSha256) {
  return JSON.stringify({ python: pins.python, distribution: pins.distribution, version: pins.version, uv: pins.uv.version, recipe, targetArch: target.arch, closure: closureSha256 });
}

/**
 * The closure lock (`closure.lock`, written by `pnpm code-intel:lock`, read by `bundle.mjs`): every distribution of the
 * runtime's dependency closure, for every target at once (`uv pip compile --universal`), each at one exact version with
 * the sha256 of every file the index offers for it. Returns `{ entries: [{ name, version, marker, hashes }] }`, or
 * `{ error }` for a requirement that is not `name==version` or carries no hash — a range, a URL or an unhashed pin would
 * let the build resolve again, which is what the lock exists to prevent (REQ-STARTUP-143: the reviewed-exceptions table
 * can never disagree with the build it covers;
 * `docs/defects/fixed/the-code-intelligence-bundle-pins-serena-agent-and-not-its-dependencies.md`).
 */
export function parseClosureLock(text) {
  const entries = [];
  // A requirement continues over `\`-ended lines; comments (uv's `# via` annotations, the header) are not requirements.
  const logical = text.replace(/\r\n/g, '\n').replace(/\\\n/g, ' ').split('\n').map((l) => l.replace(/(^|\s)#.*$/, '').trim()).filter(Boolean);
  for (const line of logical) {
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;]+)\s*(?:;\s*(.*?))?\s*((?:--hash=sha256:[0-9a-f]{64}\s*)*)$/.exec(line);
    if (!m) return { error: `the closure lock holds a requirement that is not an exact, hashed pin: ${line.slice(0, 120)}` };
    const hashes = [...m[4].matchAll(/--hash=sha256:([0-9a-f]{64})/g)].map((h) => h[1]);
    if (hashes.length === 0) return { error: `the closure lock pins ${m[1]}==${m[2]} without a hash` };
    entries.push({ name: m[1].toLowerCase().replace(/[._-]+/g, '-'), version: m[2], marker: m[3]?.trim() || null, hashes });
  }
  if (entries.length === 0) return { error: 'the closure lock holds no requirement' };
  return { entries };
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
