/**
 * The checkpoint proof (Part P): ADR-0039's first execution end to end — the run loop's capture at iteration close
 * through main to the workspace service, the rows in the store, the card and the restore flow (REQ-GIT-003/004/029..
 * 051/053..064/067/068/086..100/155, REQ-CONFIG-159..161). Scripted client, scratch store, one scratch repository
 * whose `.rotaris/` is ignored. The launches, in order (a "resume" launch opens the stored session from the session
 * browser and continues it from the composer, so numbering climbs across a resume — REQ-GIT-051):
 *
 *   capture-1   write,answer → checkpoint 1 (iteration 1): the ref, the fixed identity, REQ-GIT-047's message, HEAD,
 *               the branch and the index file's bytes unchanged, NOTES.md in the files list, the timeline entry, the event.
 *   capture-2   resume + readnotes,edit,answer (the edit tool wants the file read first in this process) → checkpoint 2 (iteration 2); the card lists two rows with local-time labels.
 *   nothing     NOTES.md committed by hand, then resume + read,answer → no third row, no ref, no warning.
 *   restore     NOTES.md edited by hand; row 1 → Restore → the confirmation with `overwrite NOTES.md` and the warning →
 *               the checkbox → confirm → the file is back at checkpoint 1's content, safety checkpoint 3 (pre_restore)
 *               holds the hand edit, last_restored_sequence = 1, the notice, the timeline entry.
 *   retention   max_per_session: 2, resume + readnotes,edit,answer → row 4; rows 1 and 2 trimmed, refs 1 and 2 gone.
 *   no-rows     a fresh session on a clean tree (read,answer) → the empty sentence, Restore disabled with its reason.
 *   ref-gone    ref 4 deleted by hand → row 4 → Restore → gate 2's second sentence.
 *   live        resume + wait:20000,answer, Restore during the run → REQ-GIT-092's first text; the app exits mid-run,
 *               leaving a persisted-running session with a dead lock …
 *   repaired    … which the next listing repairs (REQ-GIT-094): the notice `Session marked interrupted`.
 *   isolated    `checkpoints:` unset, a run through the launch dialog in a worktree → the ref in the shared repository's
 *               namespace, `.rotaris/` in no checkpoint tree; then a restore rewrites the worktree only.
 *   disabled    `enabled: false` + isolation → no checkpoint (REQ-GIT-044).
 *
 * Evidence under `.proof/checkpoint-proof/`: one PNG and one log per launch, the confirmation dialog's PNG, `results.json`
 * with the capture, preview and restore times and the Git invocation counts. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'checkpoint-proof');
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



const PROBES = [
  '[data-testid="git-checkpoint-row"]', '[data-testid="git-checkpoints-empty"]', '[data-testid="git-restore"]', '[data-testid="git-checkpoint-session"]', '[data-testid="git-checkpoint-table"]',
  '[data-testid="checkpoint-confirm"]', '[data-testid="checkpoint-summary"]', '[data-testid="checkpoint-preview-text"]', '[data-testid="checkpoint-warning"]', '[data-testid="checkpoint-overwrite"]', '[data-testid="checkpoint-restore-confirm"]', '[data-testid="checkpoint-consent-reason"]',
  '[data-testid="checkpoint-progress-text"]', '[data-testid="checkpoint-message"]', '[data-testid="acknowledgement-title"]', '.notice__headline', '.notice__detail', '.notice__body', '.app-shell', '[data-testid="git-branch"]',
];

function launch(name, workspace, local, preferences, extra, timeoutMs = 150_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  const shots = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
    const s = /capture: shot-probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (s) { try { shots[s[1]] = JSON.parse(s[2]); } catch { shots[s[1]] = []; } }
  }
  return { png, log, probes, shots };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;
const ckptRows = (probes) => probes['[data-testid="git-checkpoint-row"]'] ?? [];
const fold = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
/** The run host's capture line: `recorded checkpoint N … K file(s), I git invocations, S ms in the service, E ms end to end`. */
const captureLines = (log) => [...log.matchAll(/recorded checkpoint (\d+) for session (\S+) after iteration (\d+)[^:]*: (\d+) file\(s\), (\d+) git invocations, (\d+) ms in the service, (\d+) ms end to end/g)].map((m) => ({ sequence: Number(m[1]), sessionId: m[2], iteration: Number(m[3]), files: Number(m[4]), invocations: Number(m[5]), serviceMs: Number(m[6]), endToEndMs: Number(m[7]) }));
const previewLine = (log) => { const m = /checkpoint preview \S+\/(\d+): (\S+), (\d+) entr(?:y|ies), (\d+) dirty; (\d+) git invocations, (\d+) ms in the service, (\d+) ms end to end/.exec(log); return m ? { sequence: Number(m[1]), state: m[2], entries: Number(m[3]), dirty: Number(m[4]), invocations: Number(m[5]), serviceMs: Number(m[6]), endToEndMs: Number(m[7]) } : null; };
const restoreLine = (log) => { const m = /checkpoint restore \S+\/(\d+): restored (\d+) file\(s\) in .*?, safety (\S+?)(?:, forced)?; (\d+) git invocations, (\d+) ms in the service, (\d+) ms end to end/.exec(log); return m ? { sequence: Number(m[1]), files: Number(m[2]), safety: m[3], invocations: Number(m[4]), serviceMs: Number(m[5]), endToEndMs: Number(m[6]) } : null; };

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
const agentsYaml = (checkpoints) => [
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
  ...checkpoints,
  '',
].join('\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), agentsYaml(['checkpoints:', '  enabled: true']));
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv }).toString().trim();
const commit = (message) => git(workspace, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
git(workspace, 'init', '-q', '-b', 'main');
git(workspace, 'config', 'core.autocrlf', 'false');
// Both directories the load's amendment keeps ignored (REQ-CONFIG-013 / REQ-MCP-089; the runtime's marker since Parts T and U),
// so the amendment is a no-op on this scratch repository and the tree stays clean.
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
writeFileSync(join(workspace, 'README.md'), '# Checkpoint proof workspace\n');
git(workspace, 'add', 'README.md', '.gitignore');
commit('first');
/**
 * REQ-GIT-004's observables of the user's state. The index bytes are read LAST, after the Git commands here, and compared
 * with a read taken FIRST afterwards: Git's own reads may refresh the index file's stat cache, and the claim under test is
 * that the application's operation did not touch it — so no Git command of this script sits between the two reads.
 */
const fingerprint = (cwd) => {
  const facts = { head: git(cwd, 'rev-parse', 'HEAD'), symbolic: git(cwd, 'symbolic-ref', 'HEAD'), branches: git(cwd, 'branch', '--list', '--format=%(refname) %(objectname)'), reflog: git(cwd, 'reflog', 'show', '--format=%H %gs', 'HEAD'), staged: git(cwd, 'diff', '--cached', '--name-status') };
  return { ...facts, index: readFileSync(join(cwd, '.git', 'index')).toString('hex') };
};
const fingerprintAfter = (cwd) => {
  const index = readFileSync(join(cwd, '.git', 'index')).toString('hex');
  return { ...fingerprint(cwd), index };
};
const differing = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
const refsOf = (cwd, sid) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)', `refs/rotaris/checkpoints/${sid}/`).split(/\r?\n/).filter((l) => l !== '').map((l) => l.split(' '));
const openDb = () => { const databases = findDatabases(local); if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`); return new Database(databases[0], { readonly: true }); };
const latestSession = () => { const db = openDb(); const s = db.prepare('SELECT session_id, execution_status, worktree, last_restored_sequence FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get(); db.close(); return s; };
const checkpointsOf = (sid) => { const db = openDb(); const rows = db.prepare('SELECT * FROM checkpoints WHERE session_id = ? ORDER BY sequence').all(sid); db.close(); return rows; };
const timelineOf = (sid, name) => { const db = openDb(); const rows = db.prepare('SELECT * FROM timeline WHERE session_id = ? AND name = ? ORDER BY ordinal').all(sid, name); db.close(); return rows; };
const eventsOf = (sid, kind) => { const db = openDb(); const rows = db.prepare('SELECT payload FROM events WHERE session_id = ? AND kind = ? ORDER BY ordinal').all(sid, kind).map((r) => JSON.parse(r.payload)); db.close(); return rows; };
const issuesOf = (sid, kind) => { const db = openDb(); const rows = db.prepare('SELECT * FROM issues WHERE session_id = ? AND kind = ?').all(sid, kind); db.close(); return rows; };
const sessionRow = (sid) => { const db = openDb(); const s = db.prepare('SELECT session_id, execution_status, worktree, last_restored_sequence FROM sessions WHERE session_id = ?').get(sid); db.close(); return s; };
const results = {};
const NOTES_ORIGINAL = '# Notes\n\nWritten by the scripted agent through the gate.\n';
const NOTES_EDITED = '# Notes\n\nWritten by the scripted agent (edited) through the gate.\n';

// 1. Capture, iteration 1: a fresh session writes NOTES.md; the Git view afterwards.
const before1 = fingerprint(workspace);
const capture1 = launch('capture-1', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'write,answer', ROTARIS_CAPTURE_PROMPT: 'Write the notes.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
});
const session = latestSession();
const sid = session.session_id;
{
  if (session.execution_status !== 'completed') throw new Error(`the run ended ${session.execution_status}`);
  const rows = checkpointsOf(sid);
  if (rows.length !== 1 || rows[0].sequence !== 1 || rows[0].kind !== 'iteration' || rows[0].iteration !== 1 || rows[0].child_name !== '') throw new Error(`checkpoint rows after iteration 1: ${JSON.stringify(rows)}`);
  if (!JSON.parse(rows[0].files).includes('NOTES.md')) throw new Error(`NOTES.md is not in the files list: ${rows[0].files}`);
  const refs = refsOf(workspace, sid);
  if (refs.length !== 1 || refs[0][0] !== `refs/rotaris/checkpoints/${sid}/1` || refs[0][1] !== rows[0].commit_id) throw new Error(`refs after iteration 1: ${JSON.stringify(refs)} (row commit ${rows[0].commit_id})`);
  const shown = git(workspace, 'log', '-1', '--format=%an <%ae>%n%cn <%ce>%n%s%n%P', rows[0].commit_id).split(/\r?\n/);
  if (shown[0] !== 'rotaris <rotaris@local>' || shown[1] !== 'rotaris <rotaris@local>') throw new Error(`the checkpoint's identity is ${shown[0]} / ${shown[1]}`);
  if (shown[2] !== `rotaris checkpoint 1 for session ${sid} (iteration 1)`) throw new Error(`the commit message is "${shown[2]}"`);
  if (shown[3] !== before1.head) throw new Error(`the checkpoint's parent is ${shown[3]}, HEAD was ${before1.head}`);
  if (git(workspace, 'show', `${rows[0].commit_id}:NOTES.md`) !== NOTES_ORIGINAL.trim()) throw new Error('the checkpoint tree does not hold the written NOTES.md');
  const after1 = fingerprintAfter(workspace);
  if (differing(before1, after1).length > 0) throw new Error(`REQ-GIT-004: the user's Git state changed in ${differing(before1, after1).join(', ')}: ${JSON.stringify({ before: before1, after: after1 })}`);
  const t = timelineOf(sid, 'checkpoint_created');
  if (t.length !== 1 || t[0].actor !== 'checkpoints' || t[0].message !== 'Recorded checkpoint 1 over 1 file(s).') throw new Error(`timeline: ${JSON.stringify(t)}`);
  const ev = eventsOf(sid, 'checkpoint.created');
  if (ev.length !== 1 || ev[0].sequence !== 1 || ev[0].kind !== 'iteration' || ev[0].iteration !== 1 || ev[0].changed_paths !== 1 || ev[0].ref !== refs[0][0]) throw new Error(`event: ${JSON.stringify(ev)}`);
  const painted = ckptRows(capture1.probes);
  if (painted.length !== 1 || painted[0].data['data-sequence'] !== '1' || !/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(painted[0].text)) throw new Error(`the card painted ${JSON.stringify(painted)}`);
  const lines = captureLines(capture1.log);
  if (lines.length !== 1) throw new Error(`capture lines: ${JSON.stringify(lines)}`);
  results.capture1 = { sessionId: sid, commit: rows[0].commit_id, files: JSON.parse(rows[0].files), capture: lines[0], fingerprintUnchanged: true, cardRows: painted.length, png: capture1.png };
}

// 2. Capture, iteration 2: the session resumed from the browser and continued from the composer.
const capture2 = launch('capture-2', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'readnotes,edit,answer', ROTARIS_CAPTURE_RESUME: sid, ROTARIS_CAPTURE_PROMPT: 'Edit the notes.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
});
{
  const rows = checkpointsOf(sid);
  if (rows.map((r) => [r.sequence, r.iteration, r.kind]).join('|') !== '1,1,iteration|2,2,iteration') throw new Error(`rows after iteration 2: ${JSON.stringify(rows.map((r) => [r.sequence, r.iteration, r.kind]))}`);
  if (git(workspace, 'show', `${rows[1].commit_id}:NOTES.md`) !== NOTES_EDITED.trim()) throw new Error('checkpoint 2 does not hold the edit');
  if (refsOf(workspace, sid).length !== 2) throw new Error('two refs expected');
  const painted = ckptRows(capture2.probes);
  if (painted.length !== 2 || painted.map((p) => p.data['data-sequence']).join(',') !== '1,2') throw new Error(`the card painted ${JSON.stringify(painted)}`);
  if (readFileSync(join(workspace, 'NOTES.md'), 'utf8') !== NOTES_EDITED) throw new Error('NOTES.md was not edited by the run');
  results.capture2 = { capture: captureLines(capture2.log)[0] ?? null, cardRows: painted.map((p) => p.text), png: capture2.png };
}

// 3. Nothing to record: NOTES.md committed by hand so the tree equals HEAD; a read-only iteration records nothing.
git(workspace, 'add', 'NOTES.md');
commit('notes as the agent left them');
const nothing = launch('nothing', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'read,answer', ROTARIS_CAPTURE_RESUME: sid, ROTARIS_CAPTURE_PROMPT: 'Read the notes.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
});
{
  if (checkpointsOf(sid).length !== 2) throw new Error('a third checkpoint was recorded on a tree equal to HEAD');
  if (refsOf(workspace, sid).length !== 2) throw new Error('a third ref exists');
  if (issuesOf(sid, 'checkpoint').length !== 0) throw new Error('a checkpoint warning was recorded for nothing-to-record');
  const m = /nothing to record after iteration 3 \((\d+) git invocations, (\d+) ms\)/.exec(nothing.log);
  if (!m) throw new Error('the run host did not log nothing-to-record for iteration 3');
  results.nothing = { invocations: Number(m[1]), serviceMs: Number(m[2]), rows: 2, png: nothing.png };
}

// 4. Restore, dirty tree: a hand edit, then row 1 → Restore → the confirmation (shot) → the checkbox → confirm.
const NOTES_HAND = '# Notes\n\nEdited by hand after the run.\n';
writeFileSync(join(workspace, 'NOTES.md'), NOTES_HAND);
const before4 = fingerprint(workspace);
const dialogPng = join(output, 'restore-dialog.png');
const restored = launch('restore', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: '5',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="git-checkpoint-row"][data-sequence="1"]@3500;;[data-testid="git-restore"]@4200;;[data-testid="checkpoint-overwrite"]@9500;;[data-testid="checkpoint-restore-confirm"]@10200',
  ROTARIS_CAPTURE_SHOT: `${dialogPng}@9000`,
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '17000',
});
{
  const s = restored.shots;
  const confirm = first(s, '[data-testid="checkpoint-confirm"]');
  if (!confirm) throw new Error('the confirmation dialog was not open at the shot');
  if (confirm.data['data-dirty'] !== '1') throw new Error('the dialog did not carry the dirty state');
  const summary = text(s, '[data-testid="checkpoint-summary"]')[0] ?? '';
  if (!summary.startsWith(`This replaces 1 file(s) in ${workspace} with the state recorded in checkpoint 1. Rotaris records a safety checkpoint`)) throw new Error(`the summary reads "${summary}"`);
  const preview = text(s, '[data-testid="checkpoint-preview-text"]')[0] ?? '';
  if (preview !== ['Restoring checkpoint 1 would change 1 file(s):', '  overwrite NOTES.md', 'Warning: 1 uncommitted change(s) would be overwritten:', '  NOTES.md'].join('\n')) throw new Error(`the preview text reads:\n${preview}`);
  const warning = text(s, '[data-testid="checkpoint-warning"]')[0] ?? '';
  if (!warning.includes('1 uncommitted change(s) would be overwritten: NOTES.md Restore again with force to overwrite them.') || !warning.includes('Overwrite 1 uncommitted change(s)')) throw new Error(`the warning reads "${warning}"`);
  const confirmButton = first(s, '[data-testid="checkpoint-restore-confirm"]');
  if (!confirmButton || confirmButton.data['aria-disabled'] !== 'true' || confirmButton.data['title'] !== 'Confirm that the uncommitted changes above may be overwritten first.') throw new Error(`the confirm button before consent: ${JSON.stringify(confirmButton)}`);
  if (!existsSync(dialogPng)) throw new Error('the dialog PNG was not captured');
  // After the confirm: the file, the safety checkpoint, the record, the notice.
  if (readFileSync(join(workspace, 'NOTES.md'), 'utf8') !== NOTES_ORIGINAL) throw new Error(`NOTES.md after the restore:\n${readFileSync(join(workspace, 'NOTES.md'), 'utf8')}`);
  const rows = checkpointsOf(sid);
  if (rows.length !== 3 || rows[2].sequence !== 3 || rows[2].kind !== 'pre_restore' || rows[2].iteration !== 0) throw new Error(`rows after the restore: ${JSON.stringify(rows.map((r) => [r.sequence, r.kind]))}`);
  if (git(workspace, 'show', `${rows[2].commit_id}:NOTES.md`) !== NOTES_HAND.trim()) throw new Error('the safety checkpoint does not hold the hand edit');
  if (git(workspace, 'log', '-1', '--format=%s', rows[2].commit_id) !== `rotaris pre-restore checkpoint 3 for session ${sid} (before restoring checkpoint 1)`) throw new Error('the safety checkpoint message is wrong');
  if (sessionRow(sid).last_restored_sequence !== 1) throw new Error(`last_restored_sequence is ${sessionRow(sid).last_restored_sequence}`);
  const t = timelineOf(sid, 'checkpoint_restored');
  if (t.length !== 1 || t[0].message !== 'Restored the working tree to checkpoint 1 over 1 file(s).') throw new Error(`timeline: ${JSON.stringify(t)}`);
  const meta = JSON.parse(t[0].metadata);
  if (meta.safety_sequence !== 3 || meta.forced !== true || meta.dirty_paths !== 1 || fold(meta.tree_root) !== fold(workspace)) throw new Error(`timeline metadata: ${t[0].metadata}`);
  const ev = eventsOf(sid, 'checkpoint.restored');
  if (ev.length !== 1 || ev[0].restored !== true || ev[0].safety_sequence !== 3 || ev[0].changed_paths !== 1 || ev[0].blocked_reason !== '') throw new Error(`event: ${JSON.stringify(ev)}`);
  const after4 = fingerprintAfter(workspace);
  if (differing(before4, after4).length > 0) throw new Error(`REQ-GIT-061: the restore moved the user's Git state in ${differing(before4, after4).join(', ')}`);
  const headlines = text(restored.probes, '.notice__headline');
  if (!headlines.some((h) => h === 'Restored checkpoint 1')) throw new Error(`the notice headlines are ${JSON.stringify(headlines)}`);
  const body = [...text(restored.probes, '.notice__detail'), ...text(restored.probes, '.notice__body')].join(' ');
  if (!body.includes('1 file(s) changed. Safety checkpoint 3 holds the pre-restore state.')) throw new Error(`the notice body reads "${body}"`);
  const painted = ckptRows(restored.probes);
  if (painted.length !== 3 || painted[2].data['data-kind'] !== 'pre_restore') throw new Error(`the card after the restore: ${JSON.stringify(painted.map((p) => p.text))}`);
  results.restore = { preview: previewLine(restored.log), restore: restoreLine(restored.log), safetyCommit: rows[2].commit_id, lastRestored: 1, notice: 'Restored checkpoint 1', dialogPng, png: restored.png };
}

// 5. Retention: max_per_session 2; the next iteration trims rows 1 and 2 and their refs. The restored NOTES.md is committed
// first, so the scripted edit leaves the tree different from HEAD (the first proof run found the edit reproducing HEAD's content exactly).
git(workspace, 'add', 'NOTES.md');
commit('notes as restored');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), agentsYaml(['checkpoints:', '  enabled: true', '  max_per_session: 2']));
const retention = launch('retention', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'readnotes,edit,answer', ROTARIS_CAPTURE_RESUME: sid, ROTARIS_CAPTURE_PROMPT: 'Edit the notes again.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
});
{
  const rows = checkpointsOf(sid);
  if (rows.map((r) => r.sequence).join(',') !== '3,4') throw new Error(`rows after retention: ${rows.map((r) => r.sequence).join(',')}`);
  const refs = refsOf(workspace, sid).map((r) => r[0].split('/').pop());
  if (refs.join(',') !== '3,4') throw new Error(`refs after retention: ${refs.join(',')}`);
  if (!/retention trimmed 2 row\(s\) to 2; 2 ref\(s\) deleted/.test(retention.log)) throw new Error('the trim was not logged as rows then refs');
  results.retention = { rows: [3, 4], refs, capture: captureLines(retention.log)[0] ?? null, png: retention.png };
}

// 6. Refusals. (a) A fresh session on a clean tree records nothing: the empty sentence and Restore disabled with its reason.
git(workspace, 'add', 'NOTES.md');
commit('notes edited again');
const noRows = launch('no-rows', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'read,answer', ROTARIS_CAPTURE_PROMPT: 'Read only.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
});
const emptySid = latestSession().session_id;
{
  if (emptySid === sid) throw new Error('no fresh session was started');
  if (checkpointsOf(emptySid).length !== 0) throw new Error('the clean-tree session recorded a checkpoint');
  const p = noRows.probes;
  if (first(p, '[data-testid="git-checkpoint-session"]')?.data?.['data-testid'] === undefined) throw new Error('no picker');
  if (text(p, '[data-testid="git-checkpoints-empty"]')[0] !== 'No checkpoints are recorded for this session. Rotaris records one after each iteration of a worktree-isolated run.') throw new Error(`the empty text reads "${text(p, '[data-testid="git-checkpoints-empty"]')[0]}"`);
  const button = first(p, '[data-testid="git-restore"]');
  if (!button || button.data['data-reason'] !== 'Select a checkpoint in the list to restore it.') throw new Error(`the Restore button: ${JSON.stringify(button)}`);
  results.noRows = { sessionId: emptySid, empty: true, reason: button.data['data-reason'], png: noRows.png };
}

// (b) A checkpoint whose ref was deleted from outside: gate 2's second sentence.
git(workspace, 'update-ref', '-d', `refs/rotaris/checkpoints/${sid}/4`);
const refGone = launch('ref-gone', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: '5',
  ROTARIS_CAPTURE_SELECT: `[data-testid="git-checkpoint-session"]>>${sid}@3000`,
  ROTARIS_CAPTURE_CLICKS: '[data-testid="git-checkpoint-row"][data-sequence="4"]@4500;;[data-testid="git-restore"]@5200',
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '10000',
});
{
  const message = text(refGone.probes, '[data-testid="checkpoint-message"]')[0] ?? '';
  const expected = `Checkpoint 4 is recorded for session ${sid} but its Git snapshot is gone, so it can no longer be restored.`;
  if (!message.includes('Checkpoint 4 cannot be restored') || !message.includes(expected)) throw new Error(`the refusal dialog reads "${message}"`);
  if (checkpointsOf(sid).length !== 2) throw new Error('the refusal changed the rows');
  results.refGone = { message: expected, png: refGone.png };
}

// (c) A live run: the restore is refused with REQ-GIT-092's first text; the app then exits mid-run.
const live = launch('live', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'wait:20000,answer', ROTARIS_CAPTURE_RESUME: sid, ROTARIS_CAPTURE_PROMPT: 'Wait a while.',
  ROTARIS_CAPTURE_CLICKS: '.nav-item>>Git@6500;;[data-testid="git-checkpoint-row"][data-sequence="3"]@8500;;[data-testid="git-restore"]@9200',
  ROTARIS_CAPTURE_AFTER_MS: '13000',
});
{
  const message = text(live.probes, '[data-testid="checkpoint-message"]')[0] ?? '';
  if (!message.includes("This session is still running. Restoring would race the run's own writes, so wait for it to finish or pause it first.")) throw new Error(`the live refusal reads "${message}"`);
  if (!/checkpoint preview .* refused|liveness/.test(live.log) && !/checkpoints.list/.test(live.log)) { /* the refusal is a value, not a log line */ }
  const row = sessionRow(sid);
  if (row.execution_status !== 'running') throw new Error(`the session was left ${row.execution_status}; the repair scenario needs a persisted-running session`);
  results.live = { refused: true, leftRunning: true, png: live.png };
}

// (d) REQ-GIT-094: opening that session's checkpoints repairs it — interrupted, the lock released, the notice raised.
const repaired = launch('repaired', workspace, local, preferences, {
  ROTARIS_CAPTURE_VIEW: '5', ROTARIS_CAPTURE_SELECT: `[data-testid="git-checkpoint-session"]>>${sid}@3000`,
  ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '6000',
});
{
  const row = sessionRow(sid);
  if (row.execution_status !== 'interrupted') throw new Error(`the stale session reads ${row.execution_status}, not interrupted`);
  const db = openDb();
  const lock = db.prepare('SELECT * FROM session_locks WHERE session_id = ?').get(sid);
  db.close();
  if (lock) throw new Error('the orphaned lock was not released');
  if (timelineOf(sid, 'session.interrupted_recovered').length !== 1) throw new Error('no session.interrupted_recovered timeline entry');
  const headlines = text(repaired.probes, '.notice__headline');
  if (!/marked interrupted \(REQ-GIT-094\)/.test(repaired.log) || !/notice: Session marked interrupted/.test(repaired.log)) throw new Error('the repair and its notice were not logged');
  results.repaired = { status: 'interrupted', lockReleased: true, noticeRaised: true, noticeOnScreenAtCapture: headlines.some((h) => h === 'Session marked interrupted'), png: repaired.png };
}

// 7. Isolated: `checkpoints:` unset → enabled by isolation; the ref in the shared repository; the restore rewrites the worktree only.
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), agentsYaml([]));
// NOTES.md leaves HEAD first, so the worktree the session creates from HEAD has none and the scripted `write` (a create) lands.
git(workspace, 'rm', '-q', 'NOTES.md');
commit('notes removed');
if (existsSync(join(workspace, 'NOTES.md'))) throw new Error('NOTES.md still in the base tree');
const isolated = launch('isolated', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'write,answer',
  ROTARIS_CAPTURE_CLICKS: 'button>>New session@1800;;[data-testid="start-session-isolation"]@2800;;[data-testid="start-session-accept"]@3400',
  ROTARIS_CAPTURE_TYPE: 'Write the notes in a worktree.>>composer@4400',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
}, 180_000);
const iso = latestSession();
{
  if (iso.worktree === null) throw new Error('the isolated session carries no binding');
  const binding = JSON.parse(iso.worktree);
  const rows = checkpointsOf(iso.session_id);
  if (rows.length !== 1 || rows[0].sequence !== 1) throw new Error(`isolated rows: ${JSON.stringify(rows)}`);
  const refs = refsOf(workspace, iso.session_id);
  if (refs.length !== 1 || refs[0][1] !== rows[0].commit_id) throw new Error(`the isolated ref is not in the shared repository: ${JSON.stringify(refs)}`);
  for (const r of [...checkpointsOf(sid), ...rows]) {
    const tree = git(workspace, 'ls-tree', '-r', '--name-only', r.commit_id);
    if (/(^|\n)\.rotaris\//i.test(tree)) throw new Error(`checkpoint ${r.session_id}/${r.sequence} holds a .rotaris/ path`);
  }
  if (!/checkpoints: enabled for session .* \(checkpoints.enabled=unset, isolated/.test(isolated.log)) throw new Error('the port did not resolve unset + isolated to enabled');
  results.isolated = { sessionId: iso.session_id, worktree: binding.worktree_path, capture: captureLines(isolated.log)[0] ?? null, refInSharedRepo: true, noRotarisInAnyTree: true, png: isolated.png };
  // The restore rewrites the worktree only.
  writeFileSync(join(binding.worktree_path, 'NOTES.md'), NOTES_HAND);
  const isoRestore = launch('isolated-restore', workspace, local, preferences, {
    ROTARIS_CAPTURE_VIEW: '5', ROTARIS_CAPTURE_SELECT: `[data-testid="git-checkpoint-session"]>>${iso.session_id}@3000`,
    ROTARIS_CAPTURE_CLICKS: '[data-testid="git-checkpoint-row"][data-sequence="1"]@4500;;[data-testid="git-restore"]@5200;;[data-testid="checkpoint-overwrite"]@10500;;[data-testid="checkpoint-restore-confirm"]@11200',
    ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '800', ROTARIS_CAPTURE_AFTER_MS: '18000',
  });
  if (readFileSync(join(binding.worktree_path, 'NOTES.md'), 'utf8') !== NOTES_ORIGINAL) throw new Error('the worktree was not restored');
  if (existsSync(join(workspace, 'NOTES.md'))) throw new Error('the base tree was touched by the isolated restore');
  if (sessionRow(iso.session_id).last_restored_sequence !== 1) throw new Error('last_restored_sequence on the isolated session');
  results.isolatedRestore = { worktreeRestored: true, baseUntouched: true, preview: previewLine(isoRestore.log), restore: restoreLine(isoRestore.log), png: isoRestore.png };
}

// 8. Disabled: an explicit false stays off even when isolated (REQ-GIT-044).
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), agentsYaml(['checkpoints:', '  enabled: false']));
const disabled = launch('disabled', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'write,answer',
  ROTARIS_CAPTURE_CLICKS: 'button>>New session@1800;;[data-testid="start-session-isolation"]@2800;;[data-testid="start-session-accept"]@3400',
  ROTARIS_CAPTURE_TYPE: 'Write the notes with checkpoints off.>>composer@4400',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500', ROTARIS_CAPTURE_END_VIEW: '5', ROTARIS_CAPTURE_END_VIEW_MS: '3500',
}, 180_000);
{
  const s = latestSession();
  if (s.session_id === iso.session_id || s.worktree === null) throw new Error('no new isolated session');
  if (checkpointsOf(s.session_id).length !== 0 || refsOf(workspace, s.session_id).length !== 0) throw new Error('a checkpoint was recorded with enabled: false');
  if (!/checkpoints: disabled for session .* \(checkpoints.enabled=false, isolated/.test(disabled.log)) throw new Error('the port did not log the explicit false');
  if (text(disabled.probes, '[data-testid="git-checkpoints-empty"]')[0] !== 'No checkpoints are recorded for this session. Rotaris records one after each iteration of a worktree-isolated run.') throw new Error('the card is not empty for the disabled session');
  results.disabled = { sessionId: s.session_id, rows: 0, refs: 0, png: disabled.png };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
