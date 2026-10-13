/**
 * No proof workspace under the checkout's `.proof/` reads the enclosing repository
 * (`docs/defects/fixed/proof-workspaces-under-the-checkouts-proof-directory-read-the-enclosing-repository.md`). The product's
 * own repository read is asked here, as the app's Git view and status strip ask it, so what is pinned is what a proof's
 * evidence shows of git — not a stand-in for it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nodeClocks } from '@rotaris/platform';
import { gitEnvironment, readRepository } from '@rotaris/workspace';
import { barEnclosingRepository, PROOF_GIT_BAR, repo } from './harness.mjs';

const scratch = join(repo, '.proof', `git-bar-test-${process.pid}`);
afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });
const clocks = nodeClocks();

describe('the proof workspaces\' git bar — the harness\'s isolation (finacc3 A2-19)', () => {
  it('is in place once the harness is loaded: a `.git` file at `.proof/` naming no repository', () => {
    expect(PROOF_GIT_BAR).toBe(join(repo, '.proof', '.git'));
    expect(existsSync(PROOF_GIT_BAR)).toBe(true);
    expect(barEnclosingRepository()).toBe(PROOF_GIT_BAR);
    expect(readFileSync(PROOF_GIT_BAR, 'utf8')).toMatch(/^gitdir: /);
  });

  it('a plain workspace under `.proof/` reads as no repository, where without the bar it read the checkout', async () => {
    const workspace = join(scratch, 'workspace');
    mkdirSync(workspace, { recursive: true });
    const state = await readRepository(workspace, { clocks });
    expect(state.gitAvailable).toBe(true);
    expect(state.isRepository).toBe(false);
    expect(state.branch).toBeNull();
  });

  it('a workspace holding a repository of its own still reads that repository', async () => {
    const workspace = join(scratch, 'own');
    mkdirSync(workspace, { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'own-branch', workspace]);
    execFileSync('git', ['-C', workspace, '-c', 'user.name=proof', '-c', 'user.email=proof@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'own']);
    const state = await readRepository(workspace, { clocks });
    expect(state.isRepository).toBe(true);
    expect(state.branch).toBe('own-branch');
  });

  it('`GIT_CEILING_DIRECTORIES` cannot be the bar: the product deletes it from every git invocation (REQ-GIT-031)', () => {
    expect(gitEnvironment({ GIT_CEILING_DIRECTORIES: scratch, PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
});
