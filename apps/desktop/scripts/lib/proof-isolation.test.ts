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

/**
 * The scratch profile as the host that plans each launch spells it. A launch runs on the host that plans it, so a Windows
 * launch's profile is a Windows path and a POSIX launch's a POSIX one. Until fin30 every case here spelled a Windows host's
 * profile for all three platforms, `D:/repo/.proof/…` once POSIX-spelled: a path no POSIX machine resolves, which the
 * product now ignores in `XDG_*` as the XDG Base Directory Specification says, and which `proofIsolationEnv` refuses
 * (`docs/defects/fixed/a-relative-xdg-config-home-or-xdg-data-home-is-used-as-it-stands.md`).
 */
const WINDOWS_PROFILE = 'D:\\repo\\.proof\\transcript-proof\\profile';
const POSIX_PROFILE = '/repo/.proof/transcript-proof/profile';
const profileFor = (platform: NodeJS.Platform): string => (platform === 'win32' ? WINDOWS_PROFILE : POSIX_PROFILE);
const localFor = (platform: NodeJS.Platform): string => (platform === 'win32' ? win32 : posix).join(profileFor(platform), 'local');
const preferencesFor = (platform: NodeJS.Platform): string => (platform === 'win32' ? win32 : posix).join(profileFor(platform), 'preferences');
const LOCAL = localFor('linux');
const PREFERENCES = preferencesFor('linux');
const WINDOWS_LOCAL = localFor('win32');
const WINDOWS_PREFERENCES = preferencesFor('win32');

/** The operator's own locations, which nothing a proof drives may reach. */
const OPERATOR = {
  home: '/home/david',
  win32Home: 'C:\\Users\\david',
} as const;

describe('proof isolation lands inside the scratch profile on every platform', () => {
  // The environment a POSIX launch is handed (HOME included); the Windows launch's differs only by leaving HOME out.
  const env = proofIsolationEnv({ profileRoot: POSIX_PROFILE, local: LOCAL, preferences: PREFERENCES, platform: 'linux' });
  const windowsEnv = proofIsolationEnv({ profileRoot: WINDOWS_PROFILE, local: WINDOWS_LOCAL, preferences: WINDOWS_PREFERENCES, platform: 'win32' });

  it('names both variable pairs, and spells the POSIX pair the way a POSIX machine reads it', () => {
    expect(Object.keys(env).sort()).toEqual([
      'APPDATA', 'HOME', 'LOCALAPPDATA', 'ROTARIS_PREFERENCES_ROOT', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
    ]);
    expect(Object.keys(windowsEnv).sort()).toEqual(Object.keys(env).filter((key) => key !== 'HOME').sort());
    // A Windows-spelled `XDG_DATA_HOME` is a path no POSIX machine resolves, so even the Windows launch's inert pair is
    // POSIX-spelled; a POSIX launch's pair is absolute and under its own profile.
    expect(windowsEnv['XDG_DATA_HOME']).not.toContain('\\');
    expect(windowsEnv['XDG_CONFIG_HOME']).not.toContain('\\');
    expect(env['XDG_DATA_HOME'].startsWith(`${LOCAL}/`)).toBe(true);
    expect(posix.isAbsolute(env['XDG_DATA_HOME']) && posix.isAbsolute(env['XDG_CONFIG_HOME'])).toBe(true);
  });

  it('refuses to plan a POSIX launch from a profile no POSIX machine resolves, rather than isolating it nowhere', () => {
    // The product ignores a relative `XDG_*` value (`xdgBaseDirectory`), so a launch handed one would keep its per-user
    // state wherever its HOME's defaults are, and every directory rule below would look somewhere else.
    for (const platform of ['linux', 'darwin'] as const) {
      expect(() => proofIsolationEnv({ local: WINDOWS_LOCAL, platform })).toThrow(/not an absolute POSIX path/);
      expect(() => proofIsolationEnv({ local: 'relative/local', platform })).toThrow(/not an absolute POSIX path/);
    }
    // A Windows launch reads the Windows pair, so its own profile spelling is the one it needs.
    expect(proofIsolationEnv({ local: WINDOWS_LOCAL, platform: 'win32' })['LOCALAPPDATA']).toBe(WINDOWS_LOCAL);
  });

  it('omits the preference root rather than naming it undefined, for the launches that have none', () => {
    // Two launches isolate the data directory and deliberately name no preference root (the
    // workspace-service driver, and the packaged terminal check). `ROTARIS_PREFERENCES_ROOT=undefined`
    // is a relative path on Windows, not an absent variable, so the key has to be left out.
    const none = proofIsolationEnv({ local: WINDOWS_LOCAL, platform: 'win32' });
    expect('ROTARIS_PREFERENCES_ROOT' in none).toBe(false);
    expect(none['LOCALAPPDATA']).toBe(WINDOWS_LOCAL);
    // Windows never takes HOME, even when a caller names one: overriding it there kills Electron before it paints.
    expect('HOME' in none).toBe(false);
    expect('HOME' in proofIsolationEnv({ local: WINDOWS_LOCAL, home: `${WINDOWS_PROFILE}\\home`, platform: 'win32' })).toBe(false);
  });

  it('gives every POSIX launch a scratch home — the caller’s when it names one, beside `local` when it does not', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(proofIsolationEnv({ local: LOCAL, platform })['HOME']).toBe(`${POSIX_PROFILE}/home`);
      expect(proofIsolationEnv({ local: LOCAL, platform })['HOME']).toBe(scratchHomeFor(LOCAL));
      expect(proofIsolationEnv({ local: LOCAL, home: '/scratch/own-home', platform })['HOME']).toBe('/scratch/own-home');
    }
  });

  it('a Windows launch opens its store under the profile and never under the operator', () => {
    const dirs = resolveUserDirs({ platform: 'win32', env: windowsEnv, home: OPERATOR.win32Home });
    expect(dirs.data.startsWith(`${WINDOWS_LOCAL}${win32.sep}`)).toBe(true);
    expect(dataLayout(dirs, 'win32').workspaces.startsWith(`${WINDOWS_LOCAL}${win32.sep}`)).toBe(true);
    expect(dirs.data).not.toContain(OPERATOR.win32Home);
  });

  it('a Linux launch opens its store under the profile and never under the operator — the half that was argued', () => {
    const dirs = resolveUserDirs({ platform: 'linux', env, home: OPERATOR.home });
    expect(dirs.data.startsWith(`${LOCAL}/`)).toBe(true);
    expect(dirs.config.startsWith(`${LOCAL}/`)).toBe(true);
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
    const windowsOnly = { LOCALAPPDATA: LOCAL, APPDATA: `${POSIX_PROFILE}/roaming`, ROTARIS_PREFERENCES_ROOT: PREFERENCES };
    const dirs = resolveUserDirs({ platform: 'linux', env: windowsOnly, home: OPERATOR.home });
    expect(dirs.data).toBe(`${OPERATOR.home}/.local/share/rotaris`);
    expect(dirs.data.startsWith(LOCAL)).toBe(false);
  });

  it('a macOS launch is isolated by its HOME, which is the one platform the pairs do not reach', () => {
    // `darwin` reads neither pair — it composes from `home`. So the pairs alone leave a macOS launch in the
    // operator's own `~/Library/Application Support/rotaris`, and what isolates it is the HOME the harness now
    // sets on every POSIX launch, named or not.
    const pairsOnly = { ...env };
    delete pairsOnly['HOME'];
    const asOperator = resolveUserDirs({ platform: 'darwin', env: pairsOnly, home: OPERATOR.home });
    expect(asOperator.data.startsWith(OPERATOR.home)).toBe(true);

    const unnamed = proofIsolationEnv({ profileRoot: POSIX_PROFILE, local: LOCAL, preferences: PREFERENCES, platform: 'darwin' });
    const dirs = resolveUserDirs({ platform: 'darwin', env: unnamed, home: unnamed['HOME'] });
    expect(dirs.config.startsWith(`${POSIX_PROFILE}/`)).toBe(true);
    expect(dirs.data.startsWith(`${POSIX_PROFILE}/`)).toBe(true);
    expect(dirs.data).not.toContain(OPERATOR.home);

    const scratch = '/scratch/own-home';
    const withHome = proofIsolationEnv({ profileRoot: POSIX_PROFILE, local: LOCAL, preferences: PREFERENCES, home: scratch, platform: 'darwin' });
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
      const local = localFor(platform);
      const launched = proofIsolationEnv({ profileRoot: profileFor(platform), local, preferences: preferencesFor(platform), platform });
      const dirs = resolveUserDirs({ platform, env: launched, home: launched['HOME'] ?? OPERATOR.win32Home });
      expect(workspacesRootFor(local, platform)).toBe(dataLayout(dirs, platform).workspaces);
      // The credential directory by the same rule: the live run waits for, and deletes, exactly this directory.
      expect(tokensDirFor(local, platform)).toBe(dataLayout(dirs, platform).tokens);
      // And the configuration directory, where the discovery snapshot the live run reads back lives.
      expect(configDirFor(local, platform)).toBe(dirs.config);
      // And the machine identifier (REQ-SESSION-046), which `sessions-proof` plants into the locks that name this machine.
      expect(machineIdFileFor(local, platform)).toBe(dataLayout(dirs, platform).machineId);
      // And the data directory itself, which the product joins its code-intelligence home to (`main/sentinel.ts`) and
      // `code-intel-proof` keeps across runs (`docs/defects/fixed/slice-proof-and-code-intel-proof-spell-the-windows-data-directory-on-every-platform.md`).
      expect(dataDirFor(local, platform)).toBe(dirs.data);
    }
    // The spelling `code-intel-proof` used everywhere, `<local>/rotaris/data`, is the Windows answer only.
    expect(dataDirFor(WINDOWS_LOCAL, 'win32')).toBe(`${WINDOWS_LOCAL}\\rotaris\\data`);
    expect(dataDirFor(LOCAL, 'linux')).toBe(`${LOCAL}/rotaris/data/rotaris`);
    // The spelling `sessions-proof` used everywhere is the Windows answer only; on Linux the data directory ends in `rotaris`.
    // The Windows configuration directory is REQ-CONFIG-001's spelling, `rotaris\rotaris`, and the copy says so too:
    // until 2026-09-29 both answered `rotaris\config`, so the parity above held over a name the requirement never spells.
    expect(configDirFor(WINDOWS_LOCAL, 'win32')).toBe(`${WINDOWS_LOCAL}\\rotaris\\rotaris`);
    expect(machineIdFileFor(WINDOWS_LOCAL, 'win32')).toBe(`${WINDOWS_LOCAL}\\rotaris\\data\\machine-id`);
    expect(machineIdFileFor(LOCAL, 'linux')).toBe(`${LOCAL}/rotaris/data/rotaris/machine-id`);
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
