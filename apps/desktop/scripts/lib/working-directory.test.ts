/**
 * The directory a launch with no workspace argument runs in, and the reading of what it opened
 * (`docs/defects/fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`).
 * `settings-proof` ran four such launches in `apps/desktop`, and each opened the checkout and indexed it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { app, repo } from './harness.mjs';
import { assertOpened, emptyWorkingDirectory, enclosingRepository, openedWorkspace } from './working-directory.mjs';

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
    expect(made).toBe(realpathSync(join(scratch, 'working-directory')));
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

  it('fails the launch acceptance measured: it opened the checkout, not its empty working directory', () => {
    expect(() => assertOpened(OPENED_THE_CHECKOUT, '/home/user/Rotaris-crw-wt-accept/.proof/settings-proof/profile/working-directory', 'no-workspace'))
      .toThrow('no-workspace opened /home/user/Rotaris-crw-wt-accept/apps/desktop, not its empty working directory');
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
