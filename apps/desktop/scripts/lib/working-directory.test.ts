/**
 * The directory a launch with no workspace argument runs in, and the reading of what it opened
 * (`docs/defects/fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`).
 * `settings-proof` ran four such launches in `apps/desktop`, and each opened the checkout and indexed it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { app, repo } from './harness.mjs';
import { assertOpened, emptyWorkingDirectory, enclosingRepository, openedWorkspace, sameDirectory, SETUP_RESIDUE, setupResidue } from './working-directory.mjs';

const scratch = join(repo, '.proof', `working-directory-test-${process.pid}`);
const elsewhere: string[] = [];
afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
  for (const dir of elsewhere.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The first lines of `no-workspace.log` at acceptance, `3c03287`: the launch opened the checkout's `apps/desktop`. */
const OPENED_THE_CHECKOUT = [
  '[main 2026-10-15T11:32:57.472Z] info    run host hello: {"kind":"hello","process":"run-host","pid":23499}',
  '[main 2026-10-15T11:32:57.841Z] info    main window 1 loaded for /home/user/Rotaris-crw-wt-accept/apps/desktop (origin launch)',
  '[main 2026-10-15T11:32:59.095Z] info    run host: mcp setup: index running',
].join('\n');

describe('emptyWorkingDirectory — where a launch with no workspace argument runs', () => {
  it('under `.proof/` is new, empty and in no repository: the harness\'s git bar stops discovery there', () => {
    const made = emptyWorkingDirectory(join(scratch, 'working-directory'));
    expect(sameDirectory(made, join(scratch, 'working-directory'))).toBe(true);
    expect(enclosingRepository(made)).toBeNull();
  });

  it('empties what an earlier run left there, which a launch opening it would read', () => {
    const path = join(scratch, 'working-directory');
    mkdirSync(join(path, '.rotaris'), { recursive: true });
    writeFileSync(join(path, '.rotaris', 'workspace-id'), 'left by an earlier launch\n');
    emptyWorkingDirectory(path);
    expect(existsSync(join(path, '.rotaris'))).toBe(false);
  });

  it('refuses a directory inside a git repository, which the launch would open and index', () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-working-directory-'));
    elsewhere.push(root);
    execFileSync('git', ['init', '-q', root]);
    expect(() => emptyWorkingDirectory(join(root, 'apps', 'desktop'))).toThrow(/lies in the git repository/);
  });

  it('the checkout\'s own `apps/desktop`, where the proof ran these launches, is in the repository', () => {
    // Asked, not made: `emptyWorkingDirectory` would empty it.
    // Git for Windows prints its top level with forward slashes; the host's resolve spells it natively
    // (docs/defects/fixed/the-working-directory-case-compares-gits-forward-slashed-top-level-with-a-native-path.md).
    expect(resolve(enclosingRepository(app) ?? '')).toBe(realpathSync(repo));
  });
});

describe('openedWorkspace / assertOpened — what the launch opened, from its log', () => {
  it('reads the path from the first main window\'s line', () => {
    expect(openedWorkspace(OPENED_THE_CHECKOUT)).toBe('/home/user/Rotaris-crw-wt-accept/apps/desktop');
    expect(openedWorkspace('[main …] info    main window 1 loaded for /tmp/a b/c (origin launch)\n')).toBe('/tmp/a b/c');
  });

  it('fails the launch acceptance measured: it opened the checkout, not its own working directory', () => {
    expect(() => assertOpened(OPENED_THE_CHECKOUT, '/home/user/Rotaris-crw-wt-accept/.proof/settings-proof/profile/working-directory', 'no-workspace'))
      .toThrow('no-workspace opened /home/user/Rotaris-crw-wt-accept/apps/desktop, not its own working directory');
  });

  it('passes a launch that opened its working directory', () => {
    const log = '[main …] info    main window 1 loaded for /p/.proof/settings-proof/profile/working-directory (origin launch)\n';
    expect(assertOpened(log, '/p/.proof/settings-proof/profile/working-directory', 'tools')).toBe('/p/.proof/settings-proof/profile/working-directory');
  });

  it('fails a log that names no opened workspace, rather than passing it', () => {
    expect(openedWorkspace('[main …] info    instance claimed\n')).toBeNull();
    expect(() => assertOpened('[main …] info    instance claimed\n', '/p', 'tools')).toThrow('tools: the log names no workspace');
  });
});

describe('setupResidue — what the code-intelligence setup left in a directory', () => {
  it('names `.rotaris` and `.serena` where they are, which a launch that opened the directory leaves there', () => {
    const dir = join(scratch, 'opened');
    mkdirSync(dir, { recursive: true });
    expect(setupResidue(dir)).toEqual([]);
    // What `workspace-proof`'s `cold` launch left in the checkout's `apps/desktop` before plan `loc1`'s repair.
    mkdirSync(join(dir, '.rotaris'));
    expect(setupResidue(dir)).toEqual(['.rotaris']);
    mkdirSync(join(dir, '.serena'));
    expect(setupResidue(dir)).toEqual(['.rotaris', '.serena']);
  });

  it('reads exactly the two names `apps/desktop/.gitignore` exists for', () => {
    const ignored = readFileSync(join(app, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/\/$/, ''));
    expect([...SETUP_RESIDUE].sort()).toEqual(ignored.sort());
  });
});

/**
 * Whether the logged workspace is the working directory, compared as each side writes it. The app logs
 * `canonicalPath`'s spelling (`realpathSync.native`, an upper-case drive letter); Node's JavaScript `realpathSync` keeps
 * the letter case and the 8.3 short names it was given. Measured on Windows 11 ARM64 on 2026-10-20 (plan `loc1`):
 * `c:/dev/rotaris-crw-wt-loc1-proofcwd/.proof` reads back as given from `realpathSync` and as
 * `C:/dev/Rotaris-crw-wt-loc1-proofcwd/.proof` from `realpathSync.native` (both in backslashes), and the tree's short name
 * `C:/dev/ROA627~1` as itself and as the long name. `settings-proof` started through a path spelled in lower case failed
 * `assertOpened` at its first launch, which had opened exactly its working directory
 * (`docs/defects/fixed/assertopened-compares-the-working-directory-as-javascripts-realpath-spells-it.md`).
 */
describe('sameDirectory / assertOpened — one directory, however each side spells it', () => {
  /** A working directory as the app logs it on Windows: `canonicalPath`'s spelling. */
  const WD = 'C:\\dev\\Rotaris-crw-wt-x\\.proof\\settings-proof\\profile\\working-directory';
  it('on Windows, one directory whatever the letter case, the separator or a trailing separator', () => {
    expect(sameDirectory('c:\\users\\ganga\\appdata\\local\\temp\\wd', 'C:\\Users\\ganga\\AppData\\Local\\Temp\\wd\\', 'win32')).toBe(true);
    expect(sameDirectory('C:/dev/Rotaris-crw-wt-x/.proof/settings-proof/profile/working-directory', WD, 'win32')).toBe(true);
    expect(sameDirectory('C:\\dev\\Rotaris-crw-wt-x\\apps\\desktop', WD, 'win32')).toBe(false);
  });

  it('elsewhere, letter case names another directory, and only a trailing separator is folded', () => {
    expect(sameDirectory('/p/Working-Directory', '/p/working-directory', 'linux')).toBe(false);
    expect(sameDirectory('/p/working-directory/', '/p/working-directory', 'linux')).toBe(true);
  });

  it('passes a Windows launch whose log spells its working directory in another letter case, and still fails the checkout', () => {
    // The pair `settings-proof` read when started as `node c:/dev/rotaris-crw-wt-loc1-proofcwd/…/settings-proof.mjs`.
    const log = `[main …] info    main window 1 loaded for ${WD} (origin launch)\n`;
    const asked = WD.toLowerCase();
    expect(assertOpened(log, asked, 'no-workspace', 'win32')).toBe(WD);
    expect(() => assertOpened(log, asked, 'no-workspace', 'linux')).toThrow('not its own working directory');
    const checkout = '[main …] info    main window 1 loaded for C:\\dev\\Rotaris-crw-wt-x\\apps\\desktop (origin launch)\n';
    expect(() => assertOpened(checkout, asked, 'no-workspace', 'win32'))
      .toThrow('no-workspace opened C:\\dev\\Rotaris-crw-wt-x\\apps\\desktop, not its own working directory');
  });

  it.runIf(process.platform === 'win32')('makes the working directory in the spelling the app logs, from a path spelled in another letter case', () => {
    const asked = join(scratch, 'working-directory').toLowerCase();
    const made = emptyWorkingDirectory(asked);
    const onDisk = join(realpathSync.native(scratch), 'working-directory').replace(/^[a-z]:/, (d) => d.toUpperCase());
    expect(made).toBe(onDisk);
    // What the JavaScript `realpathSync` answers for the same spelling, and what `assertOpened` compared until plan `loc1`.
    expect(realpathSync(asked)).not.toBe(onDisk);
  });

  it.runIf(process.platform === 'win32')('makes it in the long name from an 8.3 short name, where the volume keeps one', (context) => {
    // The parent in its short name, the working directory itself in its own: `emptyWorkingDirectory` removes and makes the
    // last component, so that one is made under the name it is given.
    const parent = join(scratch, 'a-parent-with-a-long-name');
    mkdirSync(parent, { recursive: true });
    // `%~sI` is cmd's short-name expansion; verbatim, since Node would otherwise escape the quotes cmd reads.
    const shortParent = execFileSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${parent}") do @echo %~sI"`], { encoding: 'utf8', windowsVerbatimArguments: true }).trim();
    if (shortParent.toLowerCase() === parent.toLowerCase()) context.skip('the volume keeps no 8.3 short names');
    const short = join(shortParent, 'working-directory');
    const long = join(parent, 'working-directory');
    const made = emptyWorkingDirectory(short);
    expect(made).toBe(realpathSync.native(long).replace(/^[a-z]:/, (d) => d.toUpperCase()));
    expect(realpathSync(short)).not.toBe(made);
    expect(sameDirectory(short, long)).toBe(true);
  });
});
