/**
 * The harness's isolation, composed with the product's own resolution — on every platform, from
 * whichever platform is running the test.
 *
 * `docs/defects/proof-isolation-is-windows-only-so-a-driven-run-writes-the-users-real-data-directory.md`
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
import { proofIsolationEnv, tokensDirFor, workspacesRootFor } from './harness.mjs';

const PROFILE = 'D:\\repo\\.proof\\transcript-proof\\profile';
const LOCAL = `${PROFILE}\\local`;
const PREFERENCES = `${PROFILE}\\preferences`;

/** The operator's own locations, which nothing a proof drives may reach. */
const OPERATOR = {
  home: '/home/david',
  win32Home: 'C:\\Users\\david',
} as const;

describe('proof isolation lands inside the scratch profile on every platform', () => {
  const env = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES });

  it('names both variable pairs, and spells the POSIX pair the way a POSIX machine reads it', () => {
    expect(Object.keys(env).sort()).toEqual([
      'APPDATA', 'LOCALAPPDATA', 'ROTARIS_PREFERENCES_ROOT', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
    ]);
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
    const none = proofIsolationEnv({ local: LOCAL });
    expect('ROTARIS_PREFERENCES_ROOT' in none).toBe(false);
    expect(none['LOCALAPPDATA']).toBe(LOCAL);
    expect('HOME' in none).toBe(false);
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
    // `darwin` reads neither pair — it composes from `home`. The harness leaves `HOME` alone unless a
    // caller passes one (overriding it kills Electron before it paints on Windows), so a macOS launch is
    // isolated only when the caller names a scratch home. This pins that, rather than implying otherwise.
    const asOperator = resolveUserDirs({ platform: 'darwin', env, home: OPERATOR.home });
    expect(asOperator.data.startsWith(OPERATOR.home)).toBe(true);

    const scratch = `${PROFILE}/home`;
    const withHome = proofIsolationEnv({ profileRoot: PROFILE, local: LOCAL, preferences: PREFERENCES, home: scratch });
    expect(withHome['HOME']).toBe(scratch);
    expect(resolveUserDirs({ platform: 'darwin', env: withHome, home: withHome['HOME'] }).data.startsWith(scratch)).toBe(true);
  });

  it("the harness's own store-root rule agrees with the product's, on both platforms", () => {
    // `workspacesRootFor` is a COPY of `resolveUserDirs` + `dataLayout`, because `harness.mjs` is plain
    // JavaScript and cannot import a TypeScript package. This is what keeps the copy honest: three
    // scripts previously spelled the Windows answer as a literal `rotaris/data/workspaces`, which is not
    // the POSIX answer at all — there the product answers `<XDG_DATA_HOME>/rotaris/workspaces`, with no
    // `data` segment — so those readers could only ever find a store on Windows.
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const dirs = resolveUserDirs({ platform, env, home: platform === 'win32' ? OPERATOR.win32Home : OPERATOR.home });
      if (platform === 'darwin') continue; // composed from HOME, not from the pairs; not a `local`-rooted answer.
      expect(workspacesRootFor(LOCAL, platform)).toBe(dataLayout(dirs, platform).workspaces);
      // The credential directory by the same rule: the live run waits for, and deletes, exactly this directory.
      expect(tokensDirFor(LOCAL, platform)).toBe(dataLayout(dirs, platform).tokens);
    }
    // And the two answers really do differ, so the test above is not agreeing with itself.
    expect(workspacesRootFor(LOCAL, 'win32')).not.toBe(workspacesRootFor(LOCAL, 'linux'));
  });

  it('the instance socket stays short enough for a unix path, from a deep profile', () => {
    const dirs = resolveUserDirs({ platform: 'linux', env, home: OPERATOR.home });
    expect(dirs.data.length).toBeGreaterThan(40);
    // The reason `XDG_RUNTIME_DIR` exists in the pair at all: the data root alone overflows the 108-byte cap.
    expect(env['XDG_RUNTIME_DIR'].length).toBeLessThan(80);
  });
});
