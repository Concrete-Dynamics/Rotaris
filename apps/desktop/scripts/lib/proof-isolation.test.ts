/**
 * The harness's isolation, composed with the product's own resolution — on every platform, from
 * whichever platform is running the test.
 *
 * `docs/defects/fixed/proof-isolation-is-windows-only-so-a-driven-run-writes-the-users-real-data-directory.md`
 * recorded that a driven launch on Linux or macOS ignored the scratch profile and opened its workspace
 * databases under the operator's own `~/.local/share/rotaris/`. The repair names both variable pairs at
 * every launch, and its POSIX half was argued from `dirs.ts` reading exactly those variables rather than
 * measured — no POSIX host exists on this project (IC-3).
 *
 * What is measured here is precisely the join that was argued: `proofIsolationEnv`'s output is fed to the
 * product's `resolveUserDirs` once per platform, and the answer must land inside the scratch profile. That
 * is decidable on any host, because both halves take the platform as a PARAMETER. What it does NOT measure
 * is that an Electron process on Linux inherits the environment it is spawned with; that is node's contract,
 * not this product's, and it is the only step between this test and the claim the note makes.
 */
import { describe, expect, it } from 'vitest';
import { posix, win32 } from 'node:path';
import { resolveUserDirs, dataLayout } from '@rotaris/platform';
import { configDirFor, dataDirFor, machineIdFileFor, proofIsolationEnv, scratchHomeFor, tokensDirFor, workspacesRootFor } from './harness.mjs';

const PROFILE = 'D:\\repo\\.proof\\transcript-proof\\profile';
const LOCAL = `${PROFILE}\\local`;
const PREFERENCES = `${PROFILE}\\preferences`;

/** The operator's own locations, which nothing a proof drives may reach. */
const OPERATOR = {
  home: '/home/david',
  win32Home: 'C:\\Users\\david',
} as const;

describe('proof isolation lands inside the scratch profile on every platform', () => {
  // The environment a POSIX launch is handed (HOME included); the Windows launch's differs only by leaving HOME out.
  const env = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES, platform: 'linux' });

  it('names both variable pairs, and spells the POSIX pair the way a POSIX machine reads it', () => {
    expect(Object.keys(env).sort()).toEqual([
      'APPDATA', 'HOME', 'LOCALAPPDATA', 'ROTARIS_PREFERENCES_ROOT', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
    ]);
    const windows = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES, platform: 'win32' });
    expect(Object.keys(windows).sort()).toEqual(Object.keys(env).filter((key) => key !== 'HOME').sort());
    // A Windows-spelled `XDG_DATA_HOME` is a path no POSIX machine resolves — the value has to be spelled
    // for the platform that READS it, not for the one that writes it.
    expect(env['XDG_DATA_HOME']).not.toContain('\\');
    expect(env['XDG_CONFIG_HOME']).not.toContain('\\');
    expect(env['XDG_DATA_HOME'].startsWith(LOCAL.split(win32.sep).join(posix.sep))).toBe(true);
  });

  it('omits the preference root rather than naming it undefined, for the launches that have none', () => {
    // Two launches isolate the data directory and deliberately name no preference root (the
    // workspace-service driver, and the packaged terminal check). `ROTARIS_PREFERENCES_ROOT=undefined`
    // is a relative path on Windows, not an absent variable, so the key has to be left out.
    const none = proofIsolationEnv({ local: LOCAL, platform: 'win32' });
    expect('ROTARIS_PREFERENCES_ROOT' in none).toBe(false);
    expect(none['LOCALAPPDATA']).toBe(LOCAL);
    // Windows never takes HOME, even when a caller names one: overriding it there kills Electron before it paints.
    expect('HOME' in none).toBe(false);
    expect('HOME' in proofIsolationEnv({ local: LOCAL, home: `${PROFILE}\\home`, platform: 'win32' })).toBe(false);
  });

  it('gives every POSIX launch a scratch home — the caller’s when it names one, beside `local` when it does not', () => {
    const profilePosix = PROFILE.split(win32.sep).join(posix.sep);
    for (const platform of ['linux', 'darwin'] as const) {
      expect(proofIsolationEnv({ local: LOCAL, platform })['HOME']).toBe(`${profilePosix}/home`);
      expect(proofIsolationEnv({ local: LOCAL, platform })['HOME']).toBe(scratchHomeFor(LOCAL));
      expect(proofIsolationEnv({ local: LOCAL, home: '/scratch/own-home', platform })['HOME']).toBe('/scratch/own-home');
    }
  });

  it('a Windows launch opens its store under the profile and never under the operator', () => {
    const dirs = resolveUserDirs({ platform: 'win32', env, home: OPERATOR.win32Home });
    expect(dirs.data.startsWith(`${LOCAL}${win32.sep}`)).toBe(true);
    expect(dataLayout(dirs, 'win32').workspaces.startsWith(`${LOCAL}${win32.sep}`)).toBe(true);
    expect(dirs.data).not.toContain(OPERATOR.win32Home);
  });

  it('a Linux launch opens its store under the profile and never under the operator — the half that was argued', () => {
    const dirs = resolveUserDirs({ platform: 'linux', env, home: OPERATOR.home });
    const profilePosix = LOCAL.split(win32.sep).join(posix.sep);
    expect(dirs.data.startsWith(`${profilePosix}/`)).toBe(true);
    expect(dirs.config.startsWith(`${profilePosix}/`)).toBe(true);
    // The fallback the note names as the failure: `$HOME/.local/share`, the operator's own.
    expect(dirs.data).not.toContain(OPERATOR.home);
    expect(dirs.data).not.toContain('.local/share');
    // `findDatabases` walks the profile depth first, so the extra `rotaris` segment the POSIX rule adds
    // below `XDG_DATA_HOME` costs nothing — what matters is that the walk reaches it at all.
    expect(dataLayout(dirs, 'linux').workspaces).toBe(`${dirs.data}/workspaces`);
    expect(dataLayout(dirs, 'linux').workspaces).not.toContain('\\');
  });

  it('the Windows pair ALONE leaves a Linux launch in the operator’s own directory — the defect, pinned', () => {
    // The environment every proof handed its launch before the repair. Kept as an assertion rather than as
    // prose, because a test whose subject cannot fail proves nothing about the repair that made it pass.
    const windowsOnly = { LOCALAPPDATA: LOCAL, APPDATA: `${PROFILE}\\roaming`, ROTARIS_PREFERENCES_ROOT: PREFERENCES };
    const dirs = resolveUserDirs({ platform: 'linux', env: windowsOnly, home: OPERATOR.home });
    expect(dirs.data).toBe(`${OPERATOR.home}/.local/share/rotaris`);
    expect(dirs.data.startsWith(LOCAL.split(win32.sep).join(posix.sep))).toBe(false);
  });

  it('a macOS launch is isolated by its HOME, which is the one platform the pairs do not reach', () => {
    // `darwin` reads neither pair — it composes from `home`. So the pairs alone leave a macOS launch in the
    // operator's own `~/Library/Application Support/rotaris`, and what isolates it is the HOME the harness now
    // sets on every POSIX launch, named or not.
    const pairsOnly = { ...env };
    delete pairsOnly['HOME'];
    const asOperator = resolveUserDirs({ platform: 'darwin', env: pairsOnly, home: OPERATOR.home });
    expect(asOperator.data.startsWith(OPERATOR.home)).toBe(true);

    const profilePosix = PROFILE.split(win32.sep).join(posix.sep);
    const unnamed = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES, platform: 'darwin' });
    const dirs = resolveUserDirs({ platform: 'darwin', env: unnamed, home: unnamed['HOME'] });
    expect(dirs.config.startsWith(`${profilePosix}/`)).toBe(true);
    expect(dirs.data.startsWith(`${profilePosix}/`)).toBe(true);
    expect(dirs.data).not.toContain(OPERATOR.home);

    const scratch = '/scratch/own-home';
    const withHome = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES, home: scratch, platform: 'darwin' });
    expect(withHome['HOME']).toBe(scratch);
    expect(resolveUserDirs({ platform: 'darwin', env: withHome, home: withHome['HOME'] }).data.startsWith(scratch)).toBe(true);
  });

  it("the harness's own directory rules agree with the product's, on all three platforms", () => {
    // `workspacesRootFor` is a COPY of `resolveUserDirs` + `dataLayout`, because `harness.mjs` is plain
    // JavaScript and cannot import a TypeScript package. This is what keeps the copy honest: three
    // scripts previously spelled the Windows answer as a literal `rotaris/data/workspaces`, which is not
    // the POSIX answer at all — there the product answers `<XDG_DATA_HOME>/rotaris/workspaces`, with no
    // `data` segment — so those readers could only ever find a store on Windows.
    // Each platform is handed the environment ITS launch gets, and the home that launch would run with: on
    // Windows the operator's (HOME is never moved there), on POSIX the scratch home `proofIsolationEnv` sets.
    // `darwin` composes every directory from that home, which is why the copy takes the scratch home too
    // (`docs/defects/fixed/config-dir-for-answers-the-linux-directory-on-macos.md`).
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const launched = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES, platform });
      const dirs = resolveUserDirs({ platform, env: launched, home: launched['HOME'] ?? OPERATOR.win32Home });
      expect(workspacesRootFor(LOCAL, platform)).toBe(dataLayout(dirs, platform).workspaces);
      // The credential directory by the same rule: the live run waits for, and deletes, exactly this directory.
      expect(tokensDirFor(LOCAL, platform)).toBe(dataLayout(dirs, platform).tokens);
      // And the configuration directory, where the discovery snapshot the live run reads back lives.
      expect(configDirFor(LOCAL, platform)).toBe(dirs.config);
      // And the machine identifier (REQ-SESSION-046), which `sessions-proof` plants into the locks that name this machine.
      expect(machineIdFileFor(LOCAL, platform)).toBe(dataLayout(dirs, platform).machineId);
      // And the data directory itself, which the product joins its code-intelligence home to (`main/sentinel.ts`) and
      // `code-intel-proof` keeps across runs (`docs/defects/fixed/slice-proof-and-code-intel-proof-spell-the-windows-data-directory-on-every-platform.md`).
      expect(dataDirFor(LOCAL, platform)).toBe(dirs.data);
    }
    // The spelling `code-intel-proof` used everywhere, `<local>/rotaris/data`, is the Windows answer only.
    expect(dataDirFor(LOCAL, 'win32')).toBe(`${LOCAL}\\rotaris\\data`);
    expect(dataDirFor(LOCAL, 'linux')).toBe(`${LOCAL.split(win32.sep).join(posix.sep)}/rotaris/data/rotaris`);
    // The spelling `sessions-proof` used everywhere is the Windows answer only; on Linux the data directory ends in `rotaris`.
    // The Windows configuration directory is REQ-CONFIG-001's spelling, `rotaris\rotaris`, and the copy says so too:
    // until 2026-09-29 both answered `rotaris\config`, so the parity above held over a name the requirement never spells.
    expect(configDirFor(LOCAL, 'win32')).toBe(`${LOCAL}\\rotaris\\rotaris`);
    expect(machineIdFileFor(LOCAL, 'win32')).toBe(`${LOCAL}\\rotaris\\data\\machine-id`);
    expect(machineIdFileFor(LOCAL, 'linux')).toBe(`${LOCAL.split(win32.sep).join(posix.sep)}/rotaris/data/rotaris/machine-id`);
    // And the answers really do differ, so the test above is not agreeing with itself.
    expect(workspacesRootFor(LOCAL, 'win32')).not.toBe(workspacesRootFor(LOCAL, 'linux'));
    expect(configDirFor(LOCAL, 'darwin')).not.toBe(configDirFor(LOCAL, 'linux'));
    expect(configDirFor(LOCAL, 'darwin')).toBe(`${scratchHomeFor(LOCAL)}/Library/Application Support/rotaris`);
  });

  it('on macOS the copy follows the home a caller hands its launch, and nothing else', () => {
    // A caller with a scratch home of its own passes the same one to the directory rules.
    const home = '/scratch/own-home';
    const launched = proofIsolationEnv({ local: LOCAL, preferences: PREFERENCES, home, platform: 'darwin' });
    const dirs = resolveUserDirs({ platform: 'darwin', env: launched, home: launched['HOME'] });
    expect(configDirFor(LOCAL, 'darwin', home)).toBe(dirs.config);
    expect(configDirFor(LOCAL, 'darwin', home)).toBe('/scratch/own-home/Library/Application Support/rotaris');
    expect(workspacesRootFor(LOCAL, 'darwin', home)).toBe(dataLayout(dirs, 'darwin').workspaces);
    expect(tokensDirFor(LOCAL, 'darwin', home)).toBe(dataLayout(dirs, 'darwin').tokens);
    expect(machineIdFileFor(LOCAL, 'darwin', home)).toBe(dataLayout(dirs, 'darwin').machineId);
    expect(dataDirFor(LOCAL, 'darwin', home)).toBe(dirs.data);
    // The home is not read on the other two: their answers are rooted at `local`, as their launches are.
    expect(configDirFor(LOCAL, 'linux', home)).toBe(configDirFor(LOCAL, 'linux'));
    expect(configDirFor(LOCAL, 'win32', home)).toBe(configDirFor(LOCAL, 'win32'));
  });

  it('the instance socket stays short enough for a unix path, from a deep profile', () => {
    const dirs = resolveUserDirs({ platform: 'linux', env, home: OPERATOR.home });
    expect(dirs.data.length).toBeGreaterThan(40);
    // The reason `XDG_RUNTIME_DIR` exists in the pair at all: the data root alone overflows the 108-byte cap.
    expect(env['XDG_RUNTIME_DIR'].length).toBeLessThan(80);
  });
});
