#!/usr/bin/env node
// `pnpm worktree:land` — the landing sequence `AGENTS.md` ("The agent workflow") states, wrapped: fetch
// origin/main, rebase onto it (a conflict aborts and hands back — never resolved by the tool), a landing
// worktree at the rebased head, verify:plan read against origin/main, `pnpm check` on that exact head (a red
// stops it; it is never retried), the affected proof suites, a fast-forward push of that head, and cleanup.
// It never force-pushes, never merges, and never touches the remote before the push.
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { isMainModule, oneLine, seconds } from './exec.mjs';
import * as git from './git.mjs';
import { overlapWithMain } from './overlaps.mjs';
import { defaultDeps, measured, needsSetup } from './steps.mjs';

export const USAGE = `pnpm worktree:land [--skip-proofs] [--reviewed] [--keep] [--max-attempts=<n>] [--worktree=<path>]

The landing sequence of AGENTS.md ("The agent workflow"), wrapped:

  git fetch origin main
  git rebase origin/main                 # a conflict aborts the rebase and hands back
  <a landing worktree at the rebased head, set up>
  pnpm verify:plan                       # read with --base=origin/main; --reviewed is required when it asks
  pnpm check                             # on that exact head; a red stops — it is never retried
  pnpm <the affected proof suites>       # on the same head; --skip-proofs skips them loudly
  git push origin HEAD:main              # fast-forward only, never a force, never a merge
  <both worktrees removed and the branch deleted>

Before the rebase the files origin/main has moved since the fork, in which this branch also works, are
named — a rebase can merge textually while both sides have rewritten the same file. \`pnpm worktree:overlaps\`
prints the same overlap across every worktree beside origin/main.

origin/main moving under the push rebases, gates and pushes again, at most --max-attempts (3) times.
--keep leaves both trees and the branch in place. --worktree names the branch's tree when the command
runs from elsewhere (on Windows nothing can remove a tree a shell is sitting in, so the removal is
printed as the commands to run once out of it).

A run that lands — or finds the head already on origin/main — closes with the handoff of
AGENTS.md ("The handoff"): Zustand, Beweise, Offen, Nächster Schritt, one line each.

Exit codes: 0 landed, or already on origin/main · 1 stopped, nothing pushed · 2 usage
`;

/**
 * @param {string[]} args
 * @returns {{ skipProofs: boolean, reviewed: boolean, keep: boolean, maxAttempts: number | null, worktree: string | null, help: boolean, unknown: string[] }}
 */
export function parseLandArgs(args) {
  /** @type {{ skipProofs: boolean, reviewed: boolean, keep: boolean, maxAttempts: number | null, worktree: string | null, help: boolean, unknown: string[] }} */
  const parsed = { skipProofs: false, reviewed: false, keep: false, maxAttempts: null, worktree: null, help: false, unknown: [] };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--help' || a === '-h') {
      parsed.help = true;
      continue;
    }
    if (a === '--skip-proofs') {
      parsed.skipProofs = true;
      continue;
    }
    if (a === '--reviewed') {
      parsed.reviewed = true;
      continue;
    }
    if (a === '--keep') {
      parsed.keep = true;
      continue;
    }
    if (a === '--max-attempts' || a.startsWith('--max-attempts=')) {
      let value = a.slice('--max-attempts='.length);
      if (a === '--max-attempts') {
        const next = args[i + 1];
        if (next === undefined || next.startsWith('--')) {
          parsed.unknown.push('--max-attempts (missing value)');
          continue;
        }
        value = next;
        i += 1;
      }
      parsed.maxAttempts = Number(value);
      continue;
    }
    if (a === '--worktree' || a.startsWith('--worktree=')) {
      let value = a.slice('--worktree='.length);
      if (a === '--worktree') {
        const next = args[i + 1];
        if (next === undefined || next.startsWith('--')) {
          parsed.unknown.push('--worktree (missing value)');
          continue;
        }
        value = next;
        i += 1;
      }
      if (value === '') parsed.unknown.push('--worktree (missing value)');
      else parsed.worktree = value;
      continue;
    }
    parsed.unknown.push(a);
  }
  return parsed;
}

/**
 * @param {{ argv: string[], cwd?: string, deps?: import('./steps.mjs').Deps }} options
 * @returns {number} the exit code
 */
export function runLand({ argv, cwd = process.cwd(), deps = defaultDeps({ via: 'worktree:land' }) }) {
  const parsed = parseLandArgs(argv);
  if (parsed.help) {
    deps.log(USAGE);
    return 0;
  }
  if (parsed.unknown.length > 0) {
    deps.error(
      `worktree:land: unknown argument ${parsed.unknown.join(' ')} (known: --skip-proofs --reviewed --keep --max-attempts --worktree --help)`,
    );
    return 2;
  }
  if (parsed.maxAttempts !== null && (!Number.isInteger(parsed.maxAttempts) || parsed.maxAttempts < 1)) {
    deps.error('worktree:land: --max-attempts takes a whole number of 1 or more');
    return 2;
  }
  const maxAttempts = parsed.maxAttempts ?? 3;

  const tree = parsed.worktree !== null ? resolve(cwd, parsed.worktree) : cwd;
  const root = git.repoRoot(tree);
  if (root === null) {
    deps.error(`worktree:land: ${tree} is not inside a git repository`);
    return 1;
  }
  const primary = git.primaryRoot(tree);
  if (primary === null) {
    deps.error('worktree:land: cannot resolve the primary checkout');
    return 1;
  }
  // The operation first: a rebase in progress leaves HEAD detached, and naming the rebase is the help the
  // operator needs (finish it or abort it), not "detached".
  const operation = git.operationInProgress(root);
  if (operation !== null) {
    deps.error(`worktree:land: a ${operation} is in progress in ${root} — finish it (or abort it), then run again`);
    return 1;
  }
  const branch = git.currentBranch(root);
  if (branch === null) {
    deps.error(`worktree:land: HEAD is detached in ${root} — land where the branch is checked out`);
    return 1;
  }
  if (branch === 'main' || branch === 'master') {
    deps.error(`worktree:land: '${branch}' is where landed work lives; run land in the branch's own worktree`);
    return 1;
  }
  const dirty = git.porcelain(root).trim();
  if (dirty !== '') {
    deps.error('worktree:land: the branch tree holds uncommitted changes — land never stashes:');
    const lines = dirty.split('\n');
    for (const line of lines.slice(0, 12)) deps.error(`  ${line}`);
    if (lines.length > 12) deps.error('  …');
    deps.error('  commit them, or set them aside as a patch outside the checkout, then run again');
    return 1;
  }
  if (!git.hasOrigin(root)) {
    deps.error('worktree:land: this needs an `origin` remote — the push goes there');
    return 1;
  }

  const landDir = join(dirname(primary), `${basename(primary)}-wt-${git.slugFor(branch)}-land`);
  const isRegistered = () => git.worktreePaths(primary).some((path) => git.samePath(path, landDir));

  /** The landing worktree at the rebased head, re-installed when it has no dependencies yet. */
  function ensureLandingTree(head) {
    if (existsSync(landDir) && !isRegistered()) {
      deps.error(`worktree:land: ${landDir} exists but is not a registered worktree — remove it, then run again`);
      return false;
    }
    if (!existsSync(landDir)) {
      git.git(['worktree', 'prune'], { cwd: primary });
      const add = git.git(['worktree', 'add', '--detach', landDir, head], { cwd: primary });
      if (add.status !== 0) {
        deps.error(`worktree:land: git worktree add failed: ${oneLine(add.stderr)}`);
        return false;
      }
      deps.log(`worktree:land: landing tree at ${landDir}`);
    } else {
      const moved = git.git(['checkout', '--detach', '--force', head], { cwd: landDir });
      if (moved.status !== 0) {
        deps.error(`worktree:land: cannot move the landing tree to ${head.slice(0, 7)}: ${oneLine(moved.stderr)}`);
        return false;
      }
    }
    const at = git.revParse(landDir, 'HEAD');
    if (at !== head) {
      deps.error(`worktree:land: the landing tree is at ${at === null ? '?' : at.slice(0, 7)}, not ${head.slice(0, 7)}`);
      return false;
    }
    if (needsSetup(landDir)) {
      deps.log(`worktree:land: setting up the landing tree (pnpm install --prefer-offline, electron's dist/)`);
      const setup = deps.setup(landDir);
      if (!setup.ok) {
        deps.error(`worktree:land: the landing tree's setup stopped at ${setup.step ?? 'a step'} — ${landDir} stays for a second try`);
        return false;
      }
    }
    return true;
  }

  /** Plain removal, then forced when the gate rewrote a tracked artifact, then handed back. */
  function removeTree(dir) {
    if (!existsSync(dir)) return true;
    if (git.git(['worktree', 'remove', dir], { cwd: primary }).status === 0) return true;
    return git.git(['worktree', 'remove', '--force', dir], { cwd: primary }).status === 0;
  }

  /** The closing report `AGENTS.md` ("The handoff") fixes: four labelled lines, never a fifth field. */
  function handoff(state, beweis, open, next) {
    deps.log('worktree:land: handoff');
    deps.log(`  Zustand: ${state}`);
    deps.log(`  Beweise: ${beweis}`);
    deps.log(`  Offen: ${open}`);
    deps.log(`  Nächster Schritt: ${next}`);
  }

  /** The one step most landings owe: moving a primary checkout that stands on main and behind the new head. */
  function primaryHint(head) {
    if (git.currentBranch(primary) !== 'main') return null;
    const at = git.revParse(primary, 'HEAD');
    if (at === null || at === head || !git.isAncestor(primary, at, 'origin/main')) return null;
    return `fast-forward the primary checkout: git -C ${primary} merge --ff-only origin/main`;
  }

  /** Announced, then cleaned up unless --keep; cleanup failing never unmakes the landing. */
  function finish(head, pushed, evidence) {
    const sha = head.slice(0, 7);
    const state = pushed ? `landed ${sha} on origin/main` : `HEAD ${sha} is already on origin/main — nothing pushed`;
    const beweis = evidence !== '' ? evidence : 'none this run — nothing to push, so no gate ran';
    const primaryStep = primaryHint(head);
    // What exists, never what a call answers: a re-run that finds the head already on origin/main never made a
    // landing tree — and removeTree() answers true for a directory that was never there (its idempotence).
    const landDirExists = existsSync(landDir);
    if (parsed.keep) {
      if (landDirExists) {
        handoff(
          `${state}; both trees and branch ${branch} kept (--keep): ${root} and ${landDir}`,
          beweis,
          `the kept trees and branch ${branch} — run again without --keep to remove them`,
          primaryStep ?? 'nothing',
        );
      } else {
        handoff(
          `${state}; the branch worktree and branch ${branch} kept (--keep): ${root}`,
          beweis,
          `the kept branch worktree and branch ${branch} — run again without --keep to remove them`,
          primaryStep ?? 'nothing',
        );
      }
      return 0;
    }
    const open = [];
    const steps = [];
    const landGone = landDirExists ? removeTree(landDir) : true;
    if (!landGone) {
      open.push(`the landing worktree ${landDir}`);
      steps.push(`git -C ${primary} worktree remove --force ${landDir}`);
    }
    let here = null;
    try {
      here = process.cwd();
    } catch {
      // The tree may already be gone; nothing to step out of.
    }
    if (here !== null && (git.samePath(here, root) || git.isInside(here, root))) {
      try {
        process.chdir(primary);
      } catch {
        // The printed command remains the way out.
      }
    }
    const rootGone = removeTree(root);
    if (!rootGone) {
      steps.unshift(`git -C ${primary} worktree remove ${root}`, `git -C ${primary} branch -D ${branch}`);
      open.push(`the branch worktree ${root}`);
      handoff(
        `${state}; ${landDirExists && landGone ? 'the landing worktree removed; ' : ''}the branch worktree stays (a shell or an editor is sitting in it)`,
        beweis,
        open.join('; '),
        [primaryStep, ...steps].filter(Boolean).join('; ') || 'nothing',
      );
      return 0;
    }
    let branchClause = null;
    const tip = git.revParse(primary, branch);
    if (tip === null || !git.isAncestor(primary, tip, 'origin/main')) {
      open.push(`branch ${branch} — not an ancestor of origin/main, kept`);
      steps.push(`git -C ${primary} branch -D ${branch} once its extra commits are decided`);
    } else {
      const deleted = git.git(['branch', '-D', branch], { cwd: primary });
      if (deleted.status === 0) branchClause = `branch ${branch} deleted`;
      else open.push(`branch ${branch} — git branch -D refused: ${oneLine(deleted.stderr)}`);
    }
    const worked = [
      landGone
        ? landDirExists
          ? 'both worktrees removed'
          : 'the branch worktree removed'
        : `the branch worktree removed; the landing worktree ${landDir} stays`,
    ];
    if (branchClause !== null) worked.push(branchClause);
    handoff(
      `${state}; ${worked.join(', ')}`,
      beweis,
      open.join('; ') || 'nothing',
      [primaryStep, ...steps].filter(Boolean).join('; ') || 'nothing',
    );
    return 0;
  }

  let evidence = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    deps.log(`worktree:land: fetching origin/main (attempt ${attempt} of ${maxAttempts})`);
    const fetch = measured({ kind: 'other', label: 'fetch', command: 'git fetch origin main', cwd: root, via: 'worktree:land' }, () =>
      git.git(['fetch', 'origin', 'main'], { cwd: root }),
    );
    if (fetch.status !== 0) {
      deps.error(`worktree:land: git fetch failed: ${oneLine(fetch.stderr)}`);
      return 1;
    }

    if (git.isAncestor(root, 'HEAD', 'origin/main')) {
      const head = git.revParse(root, 'HEAD');
      if (head === null) {
        deps.error('worktree:land: cannot read HEAD');
        return 1;
      }
      return finish(head, false, evidence);
    }

    const overlap = overlapWithMain(root);
    if (overlap !== null && overlap.both.length > 0) {
      deps.log(
        `worktree:land: origin/main also moved since fork ${overlap.fork.slice(0, 7)}, in ${overlap.both.length} file(s) this branch changes too — read them after the rebase (a textually clean merge can still hold two rewrites):`,
      );
      for (const file of overlap.both) deps.log(`  ${file}`);
    }

    deps.log('worktree:land: rebase onto origin/main');
    const rebase = measured({ kind: 'rebase', label: 'onto-main', command: 'git rebase origin/main', cwd: root, via: 'worktree:land' }, () =>
      git.git(['rebase', 'origin/main'], { cwd: root, stdio: 'inherit' }),
    );
    if (rebase.status !== 0) {
      const conflicted = git
        .git(['diff', '--name-only', '--diff-filter=U'], { cwd: root })
        .stdout.split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      git.git(['rebase', '--abort'], { cwd: root });
      if (conflicted.length > 0) {
        deps.error(
          'worktree:land: the rebase conflicts — aborted, nothing rebased. Resolve by reading both sides (AGENTS.md names the five shapes), then run again:',
        );
        for (const file of conflicted) deps.error(`  ${file}`);
      } else {
        deps.error(`worktree:land: the rebase stopped — aborted, nothing rebased: ${oneLine(rebase.stderr)}`);
      }
      return 1;
    }
    const head = git.revParse(root, 'HEAD');
    if (head === null) {
      deps.error('worktree:land: cannot read HEAD after the rebase');
      return 1;
    }

    if (!ensureLandingTree(head)) return 1;

    let plan;
    try {
      plan = deps.plan(landDir);
    } catch (err) {
      deps.error(`worktree:land: the verification plan was not readable — ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    const proofs = Array.isArray(plan.proofs) ? plan.proofs : [];
    const review = Array.isArray(plan.review) ? plan.review : [];
    if (review.length > 0 && !parsed.reviewed) {
      deps.error('worktree:land: verify:plan asks for explicit review of these paths — read the plan, then re-run with --reviewed:');
      for (const item of review) deps.error(`  ${item.path} — ${item.reason}`);
      return 1;
    }
    deps.log(
      proofs.length > 0
        ? `worktree:land: verify:plan names ${proofs.join(', ')} for this diff`
        : 'worktree:land: verify:plan names no proof suite for this diff',
    );

    deps.log(`worktree:land: pnpm check on ${head.slice(0, 7)} (in ${landDir})`);
    const started = Date.now();
    const gate = deps.gate(landDir);
    if (!gate.ok) {
      deps.error(
        `worktree:land: the gate is red on the rebased head (after ${seconds(Date.now() - started)}) — nothing pushed. Repair it in ${root}, commit, and run again`,
      );
      return 1;
    }
    const gateMs = Date.now() - started;
    deps.log(`worktree:land: the gate is green on ${head.slice(0, 7)} (${seconds(gateMs)})`);
    evidence = `gate green on ${head.slice(0, 7)} (${seconds(gateMs)})`;

    if (proofs.length > 0) {
      if (parsed.skipProofs) {
        deps.log(`worktree:land: WARNING — --skip-proofs: ${proofs.join(', ')} have NOT run against ${head.slice(0, 7)}`);
        evidence += `; --skip-proofs: ${proofs.join(', ')} have NOT run`;
      } else {
        const pre = deps.preflight(landDir, proofs);
        if (!pre.ok) {
          deps.error('worktree:land: preflight is red for the named proofs — nothing pushed');
          return 1;
        }
        const startedProofs = Date.now();
        const ran = deps.proofs(landDir, proofs);
        if (!ran.ok) {
          deps.error(
            `worktree:land: ${ran.failed ?? 'a proof suite'} is red on the rebased head — nothing pushed. Its evidence is under ${join(landDir, '.proof')}`,
          );
          return 1;
        }
        evidence += `; proofs ${proofs.join(', ')} green (${seconds(Date.now() - startedProofs)})`;
        deps.log(`worktree:land: ${proofs.join(', ')} green (${seconds(Date.now() - startedProofs)})`);
      }
    } else {
      evidence += '; no proof suite named for this diff';
    }

    deps.log('worktree:land: pushing HEAD:main (fast-forward only, never a force)');
    const push = measured({ kind: 'other', label: 'push', command: 'git push origin HEAD:main', cwd: landDir, via: 'worktree:land' }, () =>
      git.git(['push', 'origin', 'HEAD:main'], { cwd: landDir }),
    );
    if (push.status === 0) return finish(head, true, evidence);

    measured({ kind: 'other', label: 'fetch', command: 'git fetch origin main', cwd: root, via: 'worktree:land' }, () =>
      git.git(['fetch', 'origin', 'main'], { cwd: root }),
    );
    if (!git.isAncestor(root, 'HEAD', 'origin/main')) {
      if (attempt < maxAttempts) {
        deps.log(`worktree:land: origin/main moved under the push — rebasing, gating and pushing again (attempt ${attempt + 1} of ${maxAttempts})`);
        continue;
      }
      deps.error(`worktree:land: origin/main moved under ${maxAttempts} attempt(s) — nothing pushed; run again`);
      return 1;
    }
    deps.error(`worktree:land: the push was refused and origin/main has not moved: ${oneLine(push.stderr)}`);
    return 1;
  }
  return 1; // every attempt returns; this is for the reader, not the machine
}

if (isMainModule(process.argv[1], import.meta.url)) {
  process.exit(runLand({ argv: process.argv.slice(2) }));
}
