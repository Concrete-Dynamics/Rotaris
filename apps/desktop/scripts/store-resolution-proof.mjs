/**
 * The store-resolution proof — OQ-281 (ruled 2026-10-14 by the consortium under the owner's delegation, R-072) in the built
 * application: a place that holds no store (REQ-SESSION-202) is refused, said, and resolved in Settings › Project.
 *
 *   A. seed     — a scripted run records one session; Settings' backup writes the whole store to a file
 *                 (`ROTARIS_CAPTURE_BACKUP_TO`). The app quits, and the proof empties the store's place: `workspace.db` is
 *                 removed and the directory, `origin.txt` and `sessions/` are left — what a copy or a tidy that took the
 *                 database leaves.
 *   B. restore  — the next open is refused: the error notice "The session store for this workspace is not where it is kept"
 *                 carries "Open Project settings" (REQ-NOTIFY-044); `session.list` answers the same refusal, not an empty
 *                 list (REQ-SESSION-043), a start says nothing was started because the store could not be opened
 *                 (REQ-SESSION-089) and another workspace-scoped refusal (`config.read`) states the same condition; the
 *                 notice's action opens Settings at Project, where "Start a new session store…"
 *                 stands beside "Restore session store…". The restore is pressed (its first question answered Restore),
 *                 admitted though the window has no workspace identifier; the backup's session is then listed, the
 *                 refusal's notice is gone, the new-store action is withdrawn, and the found place is kept beside the store.
 *   C. new store — the place is emptied again; the notice's action is followed again; "Start a new session store…" is
 *                 pressed twice: the first question is answered Cancel (its default) and nothing moves; the second is
 *                 answered "Start a new store", and the listing then answers an empty store, the kept place exists with
 *                 what was found in it, and an info notice names it.
 *
 * Every launch's first store is made beside its place and renamed in (OQ-281): no dot-prefixed sibling is left behind.
 *
 * Message boxes are answered by `ROTARIS_CAPTURE_ANSWERS` in order, which logs each box's title, message, detail, buttons
 * and default; the proof reads those lines to hold the dialogs to the ruling's words. Evidence under
 * `.proof/store-resolution-proof/`: `app/app.log`, the PNGs, `results.json`. `--skip-build` skips the build. Under Xvfb on
 * Linux (`xvfb-run -a -s "-screen 0 1600x1000x24"`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildDesktop, electron, evidenceDirectory, findDatabases } from './lib/harness.mjs';
import { startApp, stopApp, until } from './lib/driver.mjs';

const output = evidenceDirectory('store-resolution-proof');
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const results = { checks: [] };
const save = () => writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
const fail = (message) => { save(); throw new Error(message); };
const check = (name, condition, detail) => {
  results.checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!condition) fail(`${name}: ${detail}`);
};

const root = join(output, 'app');
const workspace = join(output, 'workspace');
const backup = join(output, 'store-backup.tar');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# store-resolution proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'mcp_servers:', '  code_intelligence: { enabled: false }', '',
].join('\n'));
const local = join(root, 'local');
const MISSING_TITLE = 'The session store for this workspace is not where it is kept';
const logFile = join(root, 'app.log');
const logText = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8') : '');
const boxLines = () => logText().split('\n').filter((l) => l.includes('capture: message box "'));

/** A launch that captures (so the message-box and dialog seams answer) and whose capture ends long after the proof quits it. */
const launch = (name, extra = {}) => startApp({
  root, workspace, timeoutMs: 90_000,
  extra: { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_PNG: join(output, `${name}.capture.png`), ROTARIS_CAPTURE_AFTER_MS: '170000', ...extra },
});
const noticeNow = (d) => d.eval(`(() => { const n = document.querySelector('[data-testid="notice"]'); return n ? { title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, detail: n.querySelector('[data-testid="notice-detail"]')?.textContent ?? null, action: n.querySelector('.notice__action')?.textContent ?? null } : null; })()`);
const establishShown = (d) => d.eval(`[...document.querySelectorAll('.settings__action button')].some((b) => b.textContent.trim() === 'Start a new session store…')`);
const listing = (d) => d.command({ kind: 'session.list' });
const stop = async (launched, name) => {
  const stopped = await stopApp(launched, { screenshot: join(output, `${name}.png`) });
  if (stopped.overran) fail(`${name}: the launch had to be ended (${JSON.stringify(stopped.overran)})`);
};
/** The one store's place: `<workspaces>/<id>/`. Its database removed, everything else in it left as found. */
const emptyThePlace = () => {
  const dbs = findDatabases(local).filter((p) => !p.includes('.displaced-'));
  if (dbs.length !== 1) fail(`expected one live store below ${local}; found ${JSON.stringify(dbs)}`);
  const place = dirname(dbs[0]);
  for (const name of ['workspace.db', 'workspace.db-wal', 'workspace.db-shm']) rmSync(join(place, name), { force: true });
  return { place, left: readdirSync(place).sort() };
};
/** The notice's own action, pressed: Settings at Project, the place this condition is resolved (OQ-281). */
const followNotice = async (d, label) => {
  const n = await until(() => noticeNow(d), (v) => v?.title === MISSING_TITLE, { timeoutMs: 30_000, what: `the store-missing notice (${label})` });
  await d.click('.notice__action', { text: 'Open Project settings' });
  await d.waitFor('.app-shell[data-view="settings"]', { timeoutMs: 10_000 });
  const selected = await until(() => d.eval(`document.querySelector('.nav-list__item.is-selected')?.textContent ?? null`), (v) => v === 'Project', { timeoutMs: 10_000, what: 'Settings at Project' });
  const offered = await until(() => establishShown(d), (v) => v === true, { timeoutMs: 10_000, what: '"Start a new session store…" offered' });
  return { notice: n, selected, offered };
};

// ── A. seed: one recorded session, and a backup of the whole store ──
{
  const launched = await launch('seed', { ROTARIS_CAPTURE_BACKUP_TO: backup });
  const d = launched.driver;
  await d.waitFor('.app-shell', { timeoutMs: 60_000 });
  await d.chord('Ctrl+2');
  await d.waitFor('.composer__input', { timeoutMs: 10_000 });
  await d.click('.composer__input');
  await d.type('record one session for the backup', { enter: true });
  const seeded = await until(() => listing(d), (r) => r?.ok === true && r.value.sessions.length === 1 && r.value.sessions[0].busy === false, { timeoutMs: 60_000, what: 'one session at rest' });
  const backedUp = await d.command({ kind: 'workspace.backup' });
  check('A: the seed run is recorded and the store backed up', seeded.ok && backedUp.ok && existsSync(backup), `${seeded.value.sessions.length} session(s); backup ${JSON.stringify(backedUp)}`);
  results.seed = { session: seeded.value.sessions[0].sessionId, status: seeded.value.sessions[0].status, backup: backedUp.value };
  await stop(launched, 'seed');
}
const firstEmptying = emptyThePlace();
results.firstEmptying = firstEmptying;
check('A: the place is left holding no store', !firstEmptying.left.includes('workspace.db') && firstEmptying.left.length > 0, `${firstEmptying.place} holds ${JSON.stringify(firstEmptying.left)}`);

// ── B. the refusal, the notice to Settings › Project, and the restore under it ──
{
  const before = boxLines().length;
  const launched = await launch('restore', { ROTARIS_CAPTURE_RESTORE_FROM: backup, ROTARIS_CAPTURE_ANSWERS: '1' });
  const d = launched.driver;
  await d.waitFor('.app-shell', { timeoutMs: 60_000 });
  const followed = await followNotice(d, 'restore');
  check('B: the refusal is raised as an error notice whose action opens Settings › Project', followed.notice.action === 'Open Project settings' && followed.selected === 'Project', `${JSON.stringify(followed.notice)}; selected ${followed.selected}`);
  check('B: the notice says where it is resolved', /Restore a backup or start a new store from Settings › Project, or put the store back in that place and open the workspace again\.$/.test(followed.notice.detail ?? ''), JSON.stringify(followed.notice.detail));
  const refusedList = await listing(d);
  check('B: the listing answers the condition, not an empty list (REQ-SESSION-043)', refusedList.ok === false && refusedList.code === 'workspace.store-missing', JSON.stringify(refusedList));
  check('B: "Start a new session store…" is offered beside the restore while the place is empty', followed.offered === true, 'offered');
  // REQ-SESSION-089 / REQ-SESSION-202: a start says which store could not be opened and that nothing was started; every other
  // workspace-scoped refusal in the window states the held condition, never "open a workspace" (OQ-281).
  const start = await d.command({ kind: 'session.start', prompt: 'start while the store is missing' });
  check('B: a start is refused as the store that could not be opened, nothing started', start.ok === false && start.code === 'workspace.store-missing' && start.headline === 'Nothing was started: the session store for this workspace could not be opened' && (start.detail ?? '').includes('the store is not in it'), JSON.stringify(start));
  const config = await d.command({ kind: 'config.read' });
  check('B: another workspace-scoped refusal states the held condition', config.ok === false && config.code === 'workspace.store-missing' && config.headline === 'The session store for this workspace is not where it is kept', JSON.stringify(config));
  await d.screenshot(join(output, 'restore.settings-project.png'));
  await d.click('.settings__action button', { text: 'Restore session store…' });
  const restored = await until(() => listing(d), (r) => r?.ok === true && r.value.sessions.length === 1, { timeoutMs: 60_000, what: 'the backup\'s session listed' });
  check('B: the restore is admitted under the refusal and the backup\'s session is listed', restored.ok && restored.value.sessions.length === 1, `${restored.value.sessions.length} session(s)`);
  const boxes = boxLines().slice(before);
  check('B: the first question says what was found, with Cancel the default', boxes.length === 1 && boxes[0].includes('"Restore the session store"') && boxes[0].includes("The place for this workspace's session store exists and the store is not in it. Restoring moves what is in that place aside, keeps it, and puts the backup's 1 session there.") && boxes[0].includes('default 0'), boxes.join(' || '));
  const after = await until(() => noticeNow(d), (n) => n?.title !== MISSING_TITLE, { timeoutMs: 15_000, what: 'the refusal notice withdrawn' });
  check('B: the refusal\'s notice is withdrawn; the restore\'s names the kept place', after === null || /What was in the place for this workspace's session store was kept at /.test(after.title ?? ''), JSON.stringify(after));
  const withdrawn = await until(() => establishShown(d), (v) => v === false, { timeoutMs: 10_000, what: '"Start a new session store…" withdrawn' });
  check('B: the new-store action is withdrawn once the store is in place', withdrawn === false, 'withdrawn');
  const kept = readdirSync(dirname(firstEmptying.place)).filter((n) => n.includes('.displaced-'));
  check('B: what was in the place is kept beside the store', kept.length === 1 && readdirSync(join(dirname(firstEmptying.place), kept[0])).sort().join(',') === firstEmptying.left.join(','), `${JSON.stringify(kept)} holding ${kept.length ? JSON.stringify(readdirSync(join(dirname(firstEmptying.place), kept[0])).sort()) : '-'}`);
  results.restore = { notice: followed.notice, boxes, after, kept };
  await stop(launched, 'restore');
}

// ── C. empty again, then "Start a new session store…": Cancel first (nothing moves), then confirmed ──
const secondEmptying = emptyThePlace();
results.secondEmptying = secondEmptying;
{
  const before = boxLines().length;
  const workspacesRoot = dirname(secondEmptying.place);
  const asideBefore = readdirSync(workspacesRoot).filter((n) => n.includes('.displaced-')).sort();
  const launched = await launch('establish', { ROTARIS_CAPTURE_ANSWERS: '0,1' });
  const d = launched.driver;
  await d.waitFor('.app-shell', { timeoutMs: 60_000 });
  await followNotice(d, 'establish');
  const cancelled = await d.command({ kind: 'workspace.establishStore' });
  const asideAfterCancel = readdirSync(workspacesRoot).filter((n) => n.includes('.displaced-')).sort();
  check('C: Cancel, the default, moves nothing', cancelled.ok && cancelled.value.cancelled === true && JSON.stringify(asideAfterCancel) === JSON.stringify(asideBefore) && !existsSync(join(secondEmptying.place, 'workspace.db')), `${JSON.stringify(cancelled)}; aside ${JSON.stringify(asideAfterCancel)}`);
  await d.click('.settings__action button', { text: 'Start a new session store…' });
  const empty = await until(() => listing(d), (r) => r?.ok === true, { timeoutMs: 30_000, what: 'the new store listed' });
  check('C: the new store opens and lists empty', empty.ok && empty.value.sessions.length === 0, `${empty.value.sessions.length} session(s)`);
  const boxes = boxLines().slice(before);
  const box = (i) => boxes[i] ?? '';
  check('C: both questions are the ruling\'s, with Cancel the default', boxes.length === 2 && boxes.every((b) => b.includes('"Start a new session store"') && b.includes(`The place for this workspace's session store exists (${secondEmptying.place}) and the store is not in it.`) && b.includes('Starting a new store recovers nothing that may have been there.') && b.includes('buttons ["Cancel","Start a new store"] default 0')) && box(0).includes('→ answered 0') && box(1).includes('→ answered 1'), boxes.join(' || '));
  const keptNow = readdirSync(workspacesRoot).filter((n) => n.includes('.displaced-') && !asideBefore.includes(n));
  check('C: what was found is kept, whole, at the path the question named', keptNow.length === 1 && box(1).includes(`moved aside to ${join(workspacesRoot, keptNow[0])} and kept`) && readdirSync(join(workspacesRoot, keptNow[0])).sort().join(',') === secondEmptying.left.join(','), `${JSON.stringify(keptNow)}`);
  const notice = await until(() => noticeNow(d), (n) => n?.title === 'A new session store was started', { timeoutMs: 15_000, what: 'the new-store notice' });
  check('C: an info notice names the kept place', (notice.detail ?? '').includes(join(workspacesRoot, keptNow[0])), JSON.stringify(notice));
  check('C: the store is in its place again', existsSync(join(secondEmptying.place, 'workspace.db')), secondEmptying.place);
  results.establish = { cancelled, boxes, kept: keptNow, notice };
  await stop(launched, 'establish');
}
{
  const workspacesRoot = dirname(secondEmptying.place);
  const siblings = readdirSync(workspacesRoot).filter((n) => n.startsWith('.') && n.endsWith('.new'));
  check('every first store was renamed into place: no sibling left beside it', siblings.length === 0, JSON.stringify(readdirSync(workspacesRoot)));
}
save();
console.log(`\nstore-resolution-proof PASSED — ${results.checks.length} checks; evidence under ${output}`);
