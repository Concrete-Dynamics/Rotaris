/**
 * The Git proof (Part O): the Git view and the worktrees, painted from what the workspace service reads and writes
 * (REQ-GIT-075..090, 102..112, 115..122, 158, 161; REQ-SHELL-125; ADR-0038's second execution). Scripted client,
 * scratch store, six launches against one scratch profile whose workspace is a repository with three commits, a local
 * bare "remote" one commit behind (so `ahead 1` and one local-tinted row exist) and `.rotaris/` ignored:
 *
 *   1. painted   — the header (branch, `ahead 1  behind 0`), one worktree row carrying the base and active markers and
 *                  `+0 -0 / 0`, three history rows exactly one of them local, the checkpoints card's no-session sentence,
 *                  the status strip's branch item, and `git view: N reads in M ms` logged; the divider dragged in by
 *                  keyboard (three Left presses) so a layout is written under `panels/git`.
 *   2. create    — New worktree → `feature/proof` typed → the derived directory → Create: a second row with
 *                  `ahead 0  behind 0`; the directory exists beside the workspace (REQ-GIT-115).
 *   3. isolated  — Overview → New session → isolation on → accept → the composer's prompt; the scripted run writes
 *                  NOTES.md IN the session worktree under `.rotaris/worktrees/<sid>` and not in the base, the session row
 *                  carries the binding, the worktree table shows the session id and `completed`, the base stays clean.
 *   4. delete    — a file dropped into `feature/proof`; Delete → Yes → Git refuses → the second confirmation → force:
 *                  the row is gone, the directory is gone, `Worktree deleted.` (REQ-GIT-111/117).
 *   5. relaunch  — the split dragged in (1) is restored (REQ-SHELL-069, `panels/git`).
 *   6. no-git    — PATH without Git: the header's empty version, `Working without Git` raised, no dialog; then a plain
 *                  folder that is not a repository: no notice (REQ-GIT-104). In both the strip's branch item reads its
 *                  state words whole and unshortened, the plain folder under a deep path (REQ-GIT-161, OQ-193).
 *
 * Evidence under `.proof/git-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { restatedFacts } from './lib/restated-facts.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'git-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);



const STRIP_BRANCH_ICON = '[data-testid="strip-branch"] i.ph-git-branch.status-strip__icon';
// REQ-WORKSPACE-149 rule 2 shortens a branch NAME from the middle; the state words are never shortened (REQ-GIT-161, OQ-193).
const STRIP_BRANCH_MIDDLE = '[data-testid="strip-branch"][data-middle="1"]';
const STRIP_BRANCH_AHEAD_ONE = '[data-testid="strip-branch"][title="Branch this workspace is on: main, 1 commit ahead."][aria-description="Branch this workspace is on: main, 1 commit ahead."]';
const PROBES = [
  '[data-testid="git-branch"]', '[data-testid="git-sync"]', '[data-testid="git-worktrees"] tr.git__row', '[data-testid="git-tag-base"]', '[data-testid="git-tag-active"]',
  '[data-testid="git-worktrees-empty"]', '[data-testid="git-history"] tr.git__commit', '[data-testid="git-history-empty"]', '[data-testid="git-checkpoints-empty"]', '[data-testid="git-checkpoint-row"]',
  '[data-testid="git-checkpoint-session"]', '[data-testid="git-divider"]', '[data-testid="acknowledgement-title"]', '[data-testid="strip-branch"]', '.notice__headline', '.app-shell',
  '[data-testid="git-new-worktree"]', '[data-testid="git-merge"]', '[data-testid="worktree-dialog"]', '[data-testid="start-session-dialog"]', '[data-testid="git-confirm-force"]', '[data-testid="git-failure"]',
  // REQ-SHELL-042 / REQ-WORKSPACE-020: the strip's branch icon, and the base checkout's tooltip sentence with its full stop.
  STRIP_BRANCH_ICON, STRIP_BRANCH_AHEAD_ONE, STRIP_BRANCH_MIDDLE,
];

async function launch(name, workspace, local, preferences, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return { png, log, probes };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;
const rows = (probes) => probes['[data-testid="git-worktrees"] tr.git__row'] ?? [];
const readLine = (log) => { const m = /git view: (\d+) reads in (\d+) ms/.exec(log); return m ? { reads: Number(m[1]), ms: Number(m[2]) } : null; };
const fold = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'runtime:',
  '  permission_mode: autonomous',
  // REQ-ORCH-025: `single` grants the entry role the direct-work bundle, so the scripted `write` step has a tool to call.
  'rotaris:',
  '  delegation_strategy: single',
  '',
].join('\n'));
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv }).toString().trim();
const commit = (message) => git(workspace, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
git(workspace, 'init', '-q', '-b', 'main');
// Both directories the load's amendment keeps ignored (REQ-CONFIG-013 / REQ-MCP-089; the runtime's marker since Parts T and U),
// so the amendment is a no-op on this scratch repository and the tree stays clean.
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
writeFileSync(join(workspace, 'README.md'), '# Git proof workspace\n');
git(workspace, 'add', 'README.md', '.gitignore');
commit('first');
writeFileSync(join(workspace, 'README.md'), '# Git proof workspace\n\nA second line.\n');
git(workspace, 'add', 'README.md');
commit('second');
// The local bare "remote": the branch pushed, then one more local commit → ahead 1, one local-tinted row (REQ-GIT-108).
const remote = join(root, 'remote.git');
git(root, 'clone', '-q', '--bare', workspace, remote);
git(workspace, 'remote', 'add', 'origin', remote);
git(workspace, 'push', '-q', '-u', 'origin', 'main');
writeFileSync(join(workspace, 'NOTES-BASE.md'), 'a local commit\n');
git(workspace, 'add', 'NOTES-BASE.md');
commit('third (local only)');
const results = {};

// 1. Painted, with the divider dragged in by keyboard: click it, then Left three times (16 px each: 480 → 528).
const painted = await launch('painted', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: '5',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="git-divider"]@3200',
  ROTARIS_CAPTURE_KEYS: 'Left@3600;;Left@3800;;Left@4000',
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '4600',
});
{
  const p = painted.probes;
  if (first(p, '.app-shell')?.data?.['data-view'] !== 'git') throw new Error(`the capture was not on the Git view (${first(p, '.app-shell')?.data?.['data-view'] ?? 'none'})`);
  if (text(p, '[data-testid="git-branch"]')[0] !== 'main') throw new Error(`the header branch reads "${text(p, '[data-testid="git-branch"]')[0]}"`);
  if (text(p, '[data-testid="git-sync"]')[0] !== 'ahead 1  behind 0') throw new Error(`the sync label reads "${text(p, '[data-testid="git-sync"]')[0]}"`);
  const r = rows(p);
  if (r.length !== 1) throw new Error(`${r.length} worktree row(s) painted, expected 1: ${JSON.stringify(r)}`);
  if (r[0].data['data-base'] !== '1' || r[0].data['data-active'] !== '1') throw new Error(`the one row lacks the base or active marker: ${JSON.stringify(r[0].data)}`);
  if (!/\+0 -0 \/ 0/.test(r[0].text) || !/base/.test(r[0].text) || !/active/.test(r[0].text)) throw new Error(`the base row text is "${r[0].text}"`);
  const commits = p['[data-testid="git-history"] tr.git__commit'] ?? [];
  if (commits.length !== 3) throw new Error(`${commits.length} history rows painted, expected 3`);
  const local1 = commits.filter((c) => c.data['data-local'] === '1');
  if (local1.length !== 1 || !/third \(local only\)/.test(local1[0].text)) throw new Error(`the local rows are ${JSON.stringify(local1.map((c) => c.text))}`);
  if (text(p, '[data-testid="git-checkpoints-empty"]')[0] !== 'Start or open a session to see the checkpoints recorded for it.') throw new Error(`the checkpoints card reads "${text(p, '[data-testid="git-checkpoints-empty"]')[0]}"`);
  if (text(p, '[data-testid="strip-branch"]')[0] !== 'main ↑1') throw new Error(`the strip's branch item reads "${text(p, '[data-testid="strip-branch"]')[0]}"`);
  if ((p[STRIP_BRANCH_ICON] ?? []).length !== 1) throw new Error(`the strip's branch item draws ${(p[STRIP_BRANCH_ICON] ?? []).length} branch icon(s), expected 1 (REQ-SHELL-042)`);
  if ((p[STRIP_BRANCH_AHEAD_ONE] ?? []).length !== 1) throw new Error('the strip\'s branch tooltip and description are not "Branch this workspace is on: main, 1 commit ahead." (REQ-WORKSPACE-020)');
  if ((p[STRIP_BRANCH_MIDDLE] ?? []).length !== 1) throw new Error('the strip\'s branch name is not drawn under REQ-WORKSPACE-149 rule 2 (no data-middle)');
  const merge = first(p, '[data-testid="git-merge"]');
  if (!merge) throw new Error('no Merge selected button');
  const divider = first(p, '[data-testid="git-divider"]');
  if (divider?.data?.['aria-valuenow'] !== '528') throw new Error(`the divider did not move by the three Left presses: aria-valuenow=${divider?.data?.['aria-valuenow'] ?? 'absent'}`);
  const read = readLine(painted.log);
  if (!read) throw new Error('no "git view: N reads in M ms" line in the log');
  // PD-MONITOR-002, live-run finding a71-9: the line is the workspace service's, which did the reads; main does not say it again.
  if (!/workspace service: git view: \d+ reads in \d+ ms/.test(painted.log)) throw new Error('the git view line is not the workspace service\'s');
  const restated = restatedFacts(painted.log);
  if (restated.length > 0) throw new Error(`a fact reached the log twice: ${restated.map((r) => `line ${r.line}, ${r.fact} (owner: ${r.owner}): ${r.text}`).join(' | ')}`);
  const stored = JSON.parse(readFileSync(join(preferences, 'preferences.json'), 'utf8'));
  if (JSON.stringify(stored['panels/git']?.sizes?.[1]) !== '528') throw new Error(`panels/git was not written as [.., 528]: ${JSON.stringify(stored['panels/git'])}`);
  results.painted = { branch: 'main', sync: text(p, '[data-testid="git-sync"]')[0], rows: r.length, history: commits.length, local: local1.length, reads: read.reads, readMs: read.ms, divider: 528, strip: { text: 'main ↑1', icon: 'ph-git-branch', title: 'Branch this workspace is on: main, 1 commit ahead.' }, png: painted.png };
}

// 2. Create a worktree through the dialog: the branch typed into the focused Branch field, the directory derived, Create.
const derived = join(root, 'feature-proof');
const created = await launch('create', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: '5',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="git-new-worktree"]@2800;;[data-testid="worktree-create"]@4600',
  ROTARIS_CAPTURE_TYPE: 'feature/proof>>no-enter@3500',
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '7500',
});
{
  const p = created.probes;
  const r = rows(p);
  if (r.length !== 2) throw new Error(`${r.length} worktree row(s) after the create, expected 2: ${JSON.stringify(r.map((x) => x.text))}`);
  const proof = r.find((x) => /feature\/proof/.test(x.text));
  if (!proof) throw new Error(`no feature/proof row: ${JSON.stringify(r.map((x) => x.text))}`);
  if (fold(proof.data['data-path']) !== fold(derived)) throw new Error(`the new row's path is ${proof.data['data-path']}, expected ${derived}`);
  if (!/-\s*idle/.test(proof.text.replace(/\s+/g, ' ')) && !/idle/.test(proof.text)) throw new Error(`the new row lacks the idle state: "${proof.text}"`);
  if (!existsSync(join(derived, 'README.md'))) throw new Error(`the worktree directory was not created at ${derived}`);
  if (!/worktree created by the user: feature\/proof/.test(created.log)) throw new Error('main did not log the creation');
  results.create = { rows: r.length, path: derived, rowText: proof.text, png: created.png };
}

// 3. An isolated session through the launch dialog; the scripted run writes NOTES.md, which must land in the worktree.
const isolated = await launch('isolated', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'write,answer',
  ROTARIS_CAPTURE_CLICKS: 'button>>New session@1800;;[data-testid="start-session-isolation"]@2800;;[data-testid="start-session-accept"]@3400',
  ROTARIS_CAPTURE_TYPE: 'Write the notes.>>composer@4400',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
}, 180_000);
{
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  const db = new Database(databases[0], { readonly: true });
  const session = db.prepare('SELECT session_id, execution_status, worktree, sandbox_mode FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
  db.close();
  if (!session) throw new Error('no session row was written');
  if (session.execution_status !== 'completed') throw new Error(`the run ended ${session.execution_status}`);
  if (session.worktree === null) throw new Error('the session row carries no worktree binding');
  const binding = JSON.parse(session.worktree);
  const expectedPath = join(workspace, '.rotaris', 'worktrees', session.session_id);
  if (fold(binding.worktree_path) !== fold(expectedPath)) throw new Error(`the binding's path is ${binding.worktree_path}, expected ${expectedPath}`);
  if (binding.branch !== `rotaris/session/${session.session_id}`) throw new Error(`the binding's branch is ${binding.branch}`);
  if (binding.base_branch !== 'main' || binding.created_by_session !== true || binding.merge_status !== 'ready') throw new Error(`the binding is ${session.worktree}`);
  if (session.sandbox_mode !== 'off') throw new Error(`the recorded sandbox mode is ${session.sandbox_mode}`);
  if (!existsSync(join(expectedPath, 'NOTES.md'))) throw new Error(`NOTES.md was not written in the worktree ${expectedPath}`);
  if (existsSync(join(workspace, 'NOTES.md'))) throw new Error('NOTES.md was written in the base workspace');
  const status = git(workspace, 'status', '--porcelain');
  if (status !== '') throw new Error(`the base tree is not clean after the isolated run:\n${status}`);
  const p = isolated.probes;
  const r = rows(p);
  const bound = r.find((x) => x.data['data-session'] === session.session_id);
  if (!bound) throw new Error(`no worktree row carries the session id ${session.session_id}: ${JSON.stringify(r.map((x) => [x.data['data-session'], x.text]))}`);
  if (!/completed/.test(bound.text) || !new RegExp(`rotaris/session/${session.session_id}`).test(bound.text)) throw new Error(`the bound row reads "${bound.text}"`);
  if (!new RegExp(`session ${session.session_id} bound to .* on rotaris/session/${session.session_id} \\(created by the session\\)`).test(isolated.log)) throw new Error('main did not log the binding');
  if (!/is isolated: the run works in/.test(isolated.log)) throw new Error('the run host did not log the effective root');
  const picker = first(p, '[data-testid="git-checkpoint-session"]');
  if (!picker || !new RegExp(`${session.session_id} · rotaris/session/${session.session_id}`).test(picker.text)) throw new Error(`the checkpoint picker reads "${picker?.text ?? 'absent'}"`);
  // Since Part P an isolated run records a checkpoint per closing iteration (REQ-GIT-044's unset default): the card lists it.
  // (Until then this line asserted the card's empty sentence; the checkpoint proof owns the card's rows in detail.)
  const ckptRows = p['[data-testid="git-checkpoint-row"]'] ?? [];
  if (ckptRows.length !== 1) throw new Error(`the checkpoints card lists ${ckptRows.length} row(s) for the isolated session, expected 1`);
  results.isolated = { sessionId: session.session_id, status: session.execution_status, binding, checkpointRows: ckptRows.length, notesInWorktree: true, notesInBase: false, baseClean: true, rowText: bound.text, png: isolated.png };
}

// 4. Delete the manual worktree through the two-step confirmation: a file dropped in first so Git refuses without --force.
writeFileSync(join(derived, 'DROPPED.txt'), 'uncommitted work\n');
const deleted = await launch('delete', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: '5',
  ROTARIS_CAPTURE_CLICKS: 'button[aria-label="Delete worktree feature/proof"]@2800;;[data-testid="git-confirm-delete"] .btn-danger@3600;;[data-testid="git-confirm-force"] .btn-danger@5200',
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '7500',
});
{
  const p = deleted.probes;
  if (!/worktree remove refused \(needs force\)/.test(deleted.log)) throw new Error('Git did not refuse the first removal for uncommitted work');
  if (!/worktree deleted by the user: .* \(forced\)/.test(deleted.log)) throw new Error('the forced removal was not logged');
  if (existsSync(derived)) throw new Error(`the worktree directory still exists at ${derived}`);
  const r = rows(p);
  if (r.some((x) => /feature\/proof/.test(x.text))) throw new Error('the feature/proof row is still in the table');
  if (text(p, '[data-testid="acknowledgement-title"]')[0] !== 'Worktree deleted.') throw new Error(`the toast reads "${text(p, '[data-testid="acknowledgement-title"]')[0] ?? 'absent'}"`);
  if ((p['[data-testid="git-failure"]'] ?? []).length > 0) throw new Error('a failure dialog is open after the delete');
  results.delete = { rows: r.length, directoryGone: true, toast: 'Worktree deleted.', png: deleted.png };
}

// 5. Relaunch: the split dragged in (1) is restored from panels/git.
const relaunch = await launch('relaunch', workspace, local, preferences, { ROTARIS_CAPTURE_VIEW: '5', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '3500' });
{
  const divider = first(relaunch.probes, '[data-testid="git-divider"]');
  if (divider?.data?.['aria-valuenow'] !== '528') throw new Error(`the stored split was not restored: aria-valuenow=${divider?.data?.['aria-valuenow'] ?? 'absent'}`);
  results.relaunch = { split: 528, rows: rows(relaunch.probes).length, png: relaunch.png };
}

// 6. PATH without Git: the header's empty version, the notice raised in main, no dialog.
const noGitPath = process.platform === 'win32' ? 'C:\\Windows\\System32' : '/nonexistent';
const noGit = await launch('no-git', workspace, local, preferences, { ROTARIS_CAPTURE_VIEW: '5', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '3500', PATH: noGitPath, Path: noGitPath });
{
  const p = noGit.probes;
  if (text(p, '[data-testid="git-branch"]')[0] !== 'not a git repository') throw new Error(`with no git the header reads "${text(p, '[data-testid="git-branch"]')[0]}"`);
  if (text(p, '[data-testid="git-sync"]')[0] !== 'ahead —  behind —') throw new Error(`with no git the sync label reads "${text(p, '[data-testid="git-sync"]')[0]}"`);
  if (!/notice: Working without Git/.test(noGit.log)) throw new Error('the Working without Git notice was not raised');
  // The workspace service's line names the root ahead of the state: `git view: N reads in M ms (<root>: git=false …)`.
  if (!/git view: \d+ reads in \d+ ms \([^\n]*git=false/.test(noGit.log)) throw new Error('the read did not end in the git=false state');
  const restatedNoGit = restatedFacts(noGit.log);
  if (restatedNoGit.length > 0) throw new Error(`with no git a fact reached the log twice: ${restatedNoGit.map((r) => r.text).join(' | ')}`);
  if (/Error box|dialog/i.test(noGit.log.split('\n').filter((l) => /git view/.test(l)).join('\n'))) throw new Error('a dialog was raised for a missing git');
  const headlines = text(p, '.notice__headline');
  // ADR-0049 holds ONE current notice: the first-launch provider notice, raised 800 ms after the workspace opened, may have replaced it by capture time.
  // OQ-193's build reading: the item conveys the state in words (REQ-GIT-161), and carries no branch icon, as it shows no branch name.
  if ((p[STRIP_BRANCH_ICON] ?? []).length !== 0) throw new Error('with no git the strip\'s branch item draws a branch icon');
  if (text(p, '[data-testid="strip-branch"]')[0] !== 'no git' || (p[STRIP_BRANCH_MIDDLE] ?? []).length !== 0) throw new Error(`with no git the strip's branch item reads "${text(p, '[data-testid="strip-branch"]')[0]}" (middle-shortened: ${(p[STRIP_BRANCH_MIDDLE] ?? []).length})`);
  results.noGit = { header: 'not a git repository', noticeRaised: true, noticeOnScreenAtCapture: headlines.some((h) => /Working without Git/.test(h)), headlinesAtCapture: headlines, dialog: false, strip: text(p, '[data-testid="strip-branch"]')[0], png: noGit.png };
}
// 6b. A plain folder that is not a repository: the same header, and no notice. It must live OUTSIDE this repository —
// a folder under `.proof/git-proof/` is inside the product's own checkout, and Git (asked, REQ-GIT-103) rightly says so.
// Deep on purpose: the strip's path link beside the branch item must be shortened, and the state words `no git repository`
// must still read whole (REQ-GIT-161, OQ-193). Until the 2026-10-03 repair round they were middle-shortened to `no …ry`.
const plainRoot = mkdtempSync(join(tmpdir(), 'rotaris-git-proof-plain-'));
const plain = join(plainRoot, 'a-plain-folder-deep-enough-that-the-status-strip-must-shorten-its-path-beside-the-branch-item', '349f6b0e-6880-59f4-942d-818d53f7b76a', 'plain');
mkdirSync(join(plain, '.rotaris'), { recursive: true });
writeFileSync(join(plain, '.rotaris', 'agents.yaml'), readFileSync(join(workspace, '.rotaris', 'agents.yaml'), 'utf8'));
const notRepo = await launch('not-a-repository', plain, local, preferences, { ROTARIS_CAPTURE_VIEW: '5', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '3500' });
{
  const p = notRepo.probes;
  if (text(p, '[data-testid="git-branch"]')[0] !== 'not a git repository') throw new Error(`for a plain folder the header reads "${text(p, '[data-testid="git-branch"]')[0]}"`);
  if (/Working without Git/.test(notRepo.log)) throw new Error('a plain folder raised the Working without Git notice');
  if (text(p, '.notice__headline').some((h) => /Working without Git/.test(h))) throw new Error('the Working without Git notice is on screen for a plain folder');
  if ((p['[data-testid="git-worktrees-empty"]'] ?? []).length !== 1 || (p['[data-testid="git-history-empty"]'] ?? []).length !== 1) throw new Error('the two empty states were not painted for a plain folder');
  if ((p[STRIP_BRANCH_ICON] ?? []).length !== 0) throw new Error('for a plain folder the strip\'s branch item draws a branch icon');
  if (text(p, '[data-testid="strip-branch"]')[0] !== 'no git repository' || (p[STRIP_BRANCH_MIDDLE] ?? []).length !== 0) throw new Error(`for a plain folder under a deep path the strip's branch item reads "${text(p, '[data-testid="strip-branch"]')[0]}" (middle-shortened: ${(p[STRIP_BRANCH_MIDDLE] ?? []).length})`);
  results.notRepository = { header: 'not a git repository', notice: false, emptyStates: 2, strip: text(p, '[data-testid="strip-branch"]')[0], png: notRepo.png };
  try { rmSync(plainRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* scratch left to the temp folder */ }
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
