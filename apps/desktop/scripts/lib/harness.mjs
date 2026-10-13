/**
 * The proof harness — what every `*-proof.mjs` had a copy of.
 *
 * Extracted 2026-09-11 from twenty-eight scripts that each carried the same `cleanEnvironment`, the same
 * `findDatabases` and, in twelve of them, the same `oneDatabase`. The bodies here are those bodies, unchanged:
 * this is a move, not a rewrite, so a proof that was green before the extraction is green for the same reason
 * after it. Where a script's copy differed only in the name of a parameter (`live-run.mjs`'s `name` for `key`,
 * `artifacts-proof.mjs`'s `dir` for `root`) it took this one; where it differed in BEHAVIOUR it kept its own
 * and is named below.
 *
 * Not extracted, deliberately: `launch`. Twenty-six scripts define one and twenty are genuinely different —
 * different environments, different probes, different timeouts, different return shapes. Normalising them
 * would be a rewrite of the evidence, and the driver (`lib/driver.mjs`) replaces the reason they diverged.
 * `launchOptions` below is the part they DO share, offered to new code rather than forced on old. The one call inside
 * every `launch` IS shared since 2026-09-29: `lib/bounded-launch.mjs`'s `spawnBounded`, because `spawnSync`'s timeout
 * reports a launch that overruns it as a clean exit, status 0 with only `error.code` `ETIMEDOUT`, and closes the pipes
 * before the quit path's lines reach the log — before 2026-09-29 it did not return at all (`lib/launch-sites.test.ts`,
 * rule 4).
 *
 * Nothing here is product code. It runs only from the proofs.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix, relative, resolve, sep, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

/** The repository root, the desktop app's directory and the Electron executable, resolved the way every proof resolves them. */
export const repo = resolve(import.meta.dirname, '..', '..', '..', '..');
export const app = join(repo, 'apps', 'desktop');

/**
 * No proof workspace under the checkout's `.proof/` reads the enclosing repository. A proof that makes its workspace a plain
 * directory there and gives it no repository of its own left the app's git discovery to climb into the checkout the proof
 * runs in, so its Git view and status strip read that checkout's branches, worktrees and diffs — another plan's, on a host
 * shared by parallel plans (`docs/defects/fixed/proof-workspaces-under-the-checkouts-proof-directory-read-the-enclosing-repository.md`).
 *
 * The bar is a `.git` FILE at `.proof/` naming no repository: git's discovery stops at the first `.git` it meets, and one that
 * names nothing answers "not a git repository" (exit 128), exactly what a workspace with no repository above it answers. A
 * workspace that holds a repository of its own, or lies in one a proof made below `.proof/`, meets that one first and is
 * unaffected; the checkout's own git ignores `.proof/`. Not `GIT_CEILING_DIRECTORIES`: the product deletes it from every git
 * invocation's environment (REQ-GIT-031, `GIT_ENV_DENYLIST`), so the variable `driver-proof` set from fin30 never reached the
 * app's git. Written when this module is loaded, which every proof that launches the app does, and idempotent.
 */
export const PROOF_GIT_BAR = join(repo, '.proof', '.git');
export function barEnclosingRepository(bar = PROOF_GIT_BAR) {
  if (existsSync(bar)) return bar;
  mkdirSync(join(bar, '..'), { recursive: true });
  writeFileSync(bar, 'gitdir: no-repository-above-a-proof-workspace\n');
  return bar;
}
barEnclosingRepository();
export const electron = process.platform === 'win32'
  ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')
  : join(repo, 'node_modules', 'electron', 'dist', 'electron');
/**
 * The switches this host needs on every launch of `electron`. Chromium refuses to start as root with its sandbox on
 * (crbug.com/638180), and a Linux container runs everything as root; on any other host the list is empty.
 */
export const hostSwitches = process.getuid?.() === 0 ? ['--no-sandbox'] : [];
/** The built main entry the proofs launch (never the packaged binary; `pnpm package` has its own probe). */
export const mainEntry = join(app, 'out', 'main', 'index.js');

/**
 * The environment a launch starts from: this process's, with every `ROTARIS_*` variable removed.
 *
 * The removal is the point. A proof that inherited the caller's `ROTARIS_MODEL_DIALECT` or a stale
 * `ROTARIS_CAPTURE_*` would be measuring the shell it ran in, and the two would be indistinguishable in the log.
 */
export function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  return env;
}

/** Every `workspace.db` below `root`, depth first. An absent root is no databases, not an error. */
export function findDatabases(root) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findDatabases(path));
    else if (entry.name === 'workspace.db') found.push(path);
  }
  return found;
}

/**
 * A path in POSIX spelling whichever separator it was written with. Splitting on the HOST's `sep` left a
 * Windows-spelled path untouched on Linux, which is why `proof-isolation.test.ts` — written to be decidable on any
 * host — could only pass on Windows (`docs/defects/fixed/the-proof-isolation-test-passes-only-on-a-windows-host.md`).
 */
function toPosix(path) {
  return path.split(/[\\/]/).join(posix.sep);
}

/**
 * Where a launch isolated at `local` keeps its workspace stores, **by the platform that will read them**.
 *
 * The product's own rule, and it is not the same shape on both sides: `resolveUserDirs` answers
 * `<LOCALAPPDATA>/rotaris/data` on win32 and `<XDG_DATA_HOME>/rotaris` — no `data` segment — everywhere
 * else, and `dataLayout` puts `workspaces` under whichever it got. Three scripts spelled the Windows
 * answer as a literal and so could only find a store on Windows
 * (`docs/defects/fixed/the-packaged-load-check-reads-its-store-at-a-windows-shaped-path.md`).
 *
 * On `darwin` the product reads neither variable pair: it composes every directory from the home directory
 * (`~/Library/Application Support/rotaris`, and `data` below it), so the answer there is rooted at the scratch
 * home the launch was given — `home`, which defaults to the one `proofIsolationEnv` sets when its caller names none.
 *
 * This is a COPY of a rule the product owns, because `harness.mjs` is plain JavaScript run straight from
 * the repository and cannot import a TypeScript package. `proof-isolation.test.ts` asserts the copy
 * against `resolveUserDirs`/`dataLayout` themselves on all three platforms, which is what keeps it from
 * drifting — a drift is a failed test, not a proof that quietly finds nothing.
 */
export function workspacesRootFor(local, platform = process.platform, home = scratchHomeFor(local)) {
  return dataSubdirFor(local, 'workspaces', platform, home);
}

/**
 * The credential directory (`dataLayout().tokens`, REQ-PROVIDER-014) below `local`, by the same copied rule. The live
 * run waited for, and deleted, the Windows spelling `local/rotaris/data/tokens` on every platform: on Linux the app
 * writes `<XDG_DATA_HOME>/rotaris/tokens`, so sign-in timed out, and `dropCredentials` removed a directory that never
 * held the key — the key's own directory survived a `--keep`. Found by the first live run on Linux, 2026-09-24.
 */
export function tokensDirFor(local, platform = process.platform, home = scratchHomeFor(local)) {
  return dataSubdirFor(local, 'tokens', platform, home);
}

/**
 * The machine identifier's file (`dataLayout().machineId`, REQ-SESSION-046: minted once per machine "in the machine-local
 * location the store lives in") below `local`, by the same copied rule. `sessions-proof` read it at the Windows spelling
 * `local/rotaris/data/machine-id` on every platform. On Linux the app writes `<XDG_DATA_HOME>/rotaris/machine-id`, so
 * planting a lock that names this machine crashed with ENOENT, and `repair-all` and every launch after it went
 * unmeasured (`docs/defects/fixed/sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md`).
 */
export function machineIdFileFor(local, platform = process.platform, home = scratchHomeFor(local)) {
  return dataSubdirFor(local, 'machine-id', platform, home);
}

/**
 * The configuration directory (`resolveUserDirs().config`) of a launch isolated at `local`, by the same copied rule:
 * on Windows `local/rotaris/rotaris` (REQ-CONFIG-001's `%LOCALAPPDATA%\rotaris\rotaris\`), on macOS
 * `<home>/Library/Application Support/rotaris`, elsewhere `<XDG_CONFIG_HOME>/rotaris`. The live run read the discovery snapshot (`project_settings.yaml`) at the Windows
 * spelling on every platform, so on Linux it reported the authenticated provider missing from a file it never
 * opened. Found by the Linux live run, 2026-09-24.
 *
 * `home` is the scratch home the launch was given. The macOS answer is composed from it and from nothing else,
 * because the product reads no `XDG_*` variable there; until 2026-09-28 this copy gave `darwin` the `XDG` answer,
 * a directory the product never reads on macOS
 * (`docs/defects/fixed/config-dir-for-answers-the-linux-directory-on-macos.md`). A caller that hands its launch a
 * home of its own passes the same one here; one that does not takes the default `proofIsolationEnv` sets.
 *
 * The Windows answer moved with the product's on 2026-09-29: `resolveUserDirs` had spelled it `rotaris\config`, a
 * name REQ-CONFIG-001 never spells, and this copy followed it
 * (`docs/defects/fixed/the-windows-global-configuration-directory-is-not-the-one-req-config-001-spells.md`).
 */
export function configDirFor(local, platform = process.platform, home = scratchHomeFor(local)) {
  if (platform === 'win32') return win32.join(local, 'rotaris', 'rotaris');
  if (platform === 'darwin') return macosApplicationSupport(home);
  return posix.join(toPosix(local), 'rotaris', 'config', 'rotaris');
}

/**
 * The data directory itself (`resolveUserDirs().data`) of a launch isolated at `local`, by the same copied rule: on
 * Windows `local/rotaris/data`, on macOS `<home>/Library/Application Support/rotaris/data`, elsewhere
 * `<XDG_DATA_HOME>/rotaris`. For a location the product joins to it directly rather than through `dataLayout` — the
 * code-intelligence home (`src/main/sentinel.ts`). `slice-proof` and `code-intel-proof` spelled the Windows answer on
 * every platform
 * (`docs/defects/fixed/slice-proof-and-code-intel-proof-spell-the-windows-data-directory-on-every-platform.md`).
 */
export function dataDirFor(local, platform = process.platform, home = scratchHomeFor(local)) {
  if (platform === 'win32') return win32.join(local, 'rotaris', 'data');
  if (platform === 'darwin') return posix.join(macosApplicationSupport(home), 'data');
  return posix.join(toPosix(local), 'rotaris', 'data', 'rotaris');
}

function dataSubdirFor(local, leaf, platform, home) {
  return (platform === 'win32' ? win32 : posix).join(dataDirFor(local, platform, home), leaf);
}

/** `resolveUserDirs`'s `darwin` configuration directory below a home, spelled for the platform that reads it. */
function macosApplicationSupport(home) {
  return posix.join(toPosix(home), 'Library', 'Application Support', 'rotaris');
}

/**
 * The scratch home a POSIX launch isolated at `local` is given when its caller names none: `home` beside `local`
 * in the scratch profile, the sibling convention `roaming` already follows. Derived from `local` alone so that the
 * directory rules above (`configDirFor`, `workspacesRootFor`, `tokensDirFor`) can compose the macOS answer from the
 * same argument every caller already passes them.
 */
export function scratchHomeFor(local) {
  return posix.join(toPosix(local), '..', 'home');
}

/** The one store below `local`, or a thrown error naming how many there were — a proof that opened the wrong store is the defect this refuses to become. */
export function oneDatabase(local) {
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  return databases[0];
}

/**
 * An evidence directory below the repository, emptied. The containment check is not decoration: the path is
 * composed from a caller's string, and a proof that deleted a tree outside the repository would do it recursively.
 */
export function evidenceDirectory(name) {
  const output = name.endsWith('-proof') ? resolve(repo, '.proof', name.replace(/^\./, '')) : resolve(repo, name);
  const inside = relative(repo, output);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`)) throw new Error(`proof output escaped the repository: ${output}`);
  return output;
}

/** `pnpm --filter @rotaris/desktop build`, with the log written beside the evidence. Skipped by `--skip-build` in the caller. */
export function buildDesktop(output) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  }
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}

/**
 * The environment every launch shares — the clean base, the scratch profile's three roots and the scripted
 * dialect. A caller adds its own seams on top; nothing here presumes a capture. `home` is `proofIsolationEnv`'s,
 * passed through: a POSIX caller may name its scratch home there (every POSIX launch gets one either way), and a
 * Windows launch never sets `HOME` whatever it is passed (see below).
 */
export function launchOptions({ local, preferences, home, extra = {} }) {
  return {
    ...cleanEnvironment(),
    ...proofIsolationEnv({ local, preferences, home }),
    ROTARIS_MODEL_DIALECT: 'scripted',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ...extra,
  };
}

/**
 * What makes a driven launch's per-user roots land inside the scratch profile on EVERY platform, not just
 * Windows (the proof-isolation defect: `LOCALAPPDATA`/`APPDATA` alone leave a POSIX launch resolving its data
 * directory from `XDG_DATA_HOME` or `$HOME/.local/share` — the operator's own — while its preferences land in
 * the profile, because `ROTARIS_PREFERENCES_ROOT` is the product's own variable and is honoured everywhere).
 *
 * The platform decides which pair the product reads (`packages/platform/src/dirs.ts`), so the harness names
 * both: the Windows pair on every launch, and the POSIX pair on every launch. On the platform that does not
 * read a pair it is two inert variables; on the one that does it is the isolation. Nothing about the product's
 * own fallback discipline is untestable this way — a launch that must exercise the fallback clears the pair
 * after spreading this object.
 *
 * `HOME` is set for the same reason, on every POSIX launch. `dirs.ts` falls back to the operator's home when
 * neither XDG variable is set, and on macOS it reads no XDG variable at all — every per-user directory is composed
 * from the home — so a macOS launch that leaves `HOME` alone writes the operator's own
 * `~/Library/Application Support/rotaris`. The value is the caller's `home` when it names one, and
 * `scratchHomeFor(local)` otherwise, which is what lets `configDirFor` and the data rules answer the macOS
 * directory from `local` alone. A Windows launch never takes it: overriding the real home there kills Electron
 * before it paints, and Windows reads `LOCALAPPDATA`, not the home. `platform` is the platform the launch runs on,
 * a parameter for the same reason `resolveUserDirs` takes one: so the answer is decidable from any host.
 *
 * The short `XDG_RUNTIME_DIR` is the socket's half of the same defect. The single-instance claim listens on a
 * unix socket, and a unix socket path is capped at 108 bytes — a data root nested three deep under
 * `.proof/<name>/profile` already overflows it. A runtime directory under the system temporary directory keeps
 * the path short whatever the profile's depth. The product reads this variable for the claim's socket and for
 * nothing else, so nothing but the socket moves (`socketDirectoryCandidates`, `packages/platform/src/instance.ts`).
 * Until fin30 this comment said "the product never reads this variable", which was untrue: the claim has read it
 * since 2026-09-19 (`docs/defects/fixed/an-empty-xdg-runtime-dir-puts-the-instance-socket-in-the-working-directory.md`).
 * Since fin30 the product also falls back on its own, to a private directory below the temporary directory (since
 * OQ-248, 2026-10-13, one each claim attempt makes and removes, `rotaris-XXXXXX`), when neither the runtime directory nor
 * the data directory can hold the socket
 * (`docs/defects/fixed/a-deep-data-directory-leaves-the-launch-windowless.md`), so this variable is no longer what
 * makes a deep profile launchable; it still keeps each profile's socket in a directory of that profile's own, and
 * `workspace-proof`'s scenario 13b takes it away to drive the fallback.
 */
export function proofIsolationEnv({ profileRoot, local, preferences, home, platform = process.platform }) {
  // The POSIX pair is spelled with POSIX separators even when the harness runs on Windows, where the pair is
  // inert: a Windows-spelled value is a path no POSIX machine would resolve.
  const data = posix.join(toPosix(local), 'rotaris', 'data');
  const config = posix.join(toPosix(local), 'rotaris', 'config');
  // A POSIX launch reads the pair, and since fin30 the product ignores a value that is not absolute, as the XDG Base
  // Directory Specification says (`xdgBaseDirectory`, `packages/platform/src/dirs.ts`): a profile a POSIX machine cannot
  // resolve would quietly put the launch's per-user state under its scratch HOME's defaults, or under the operator's,
  // rather than where this harness's directory rules look. A launch runs on the host that plans it, so its profile is
  // that host's own absolute path; one spelled for another host (`D:/repo/.proof/…` for a Linux launch, which
  // `proof-isolation.test.ts` once modelled) is refused here, loudly, instead
  // (`docs/defects/fixed/a-relative-xdg-config-home-or-xdg-data-home-is-used-as-it-stands.md`).
  if (platform !== 'win32' && !posix.isAbsolute(data)) {
    throw new Error(`proofIsolationEnv: a ${platform} launch reads XDG_DATA_HOME, and ${data} is not an absolute POSIX path`);
  }
  const digest = createHash('sha256').update(data).digest('hex').slice(0, 12);
  const runtime = join(tmpdir(), `rotaris-proof-${digest}`);
  const roaming = profileRoot !== undefined
    ? join(profileRoot, 'roaming')
    : join(local, '..', 'roaming');
  const env = {
    LOCALAPPDATA: local,
    APPDATA: roaming,
    XDG_DATA_HOME: data,
    XDG_CONFIG_HOME: config,
    XDG_RUNTIME_DIR: runtime,
  };
  // Omitted rather than set to `undefined`: two launches here isolate the data directory and deliberately
  // leave the preference root alone (the workspace-service driver, and the packaged load check, neither of
  // which opens a preference store). Naming the key with no value would put the string "undefined" in the
  // child's environment on Windows, which is a path.
  if (preferences !== undefined) env.ROTARIS_PREFERENCES_ROOT = preferences;
  if (platform !== 'win32') env.HOME = home ?? scratchHomeFor(local);
  return env;
}

/** The `capture: probe <selector> → <json>` lines a launch logged, by selector. The shape twenty scripts parse. */
export function readProbes(log) {
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return probes;
}
