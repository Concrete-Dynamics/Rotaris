import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { backgroundSetupStarted, SETUP_ANSWERED } from './lib/initialization-marker.mjs';

/**
 * ADR-0049's first execution in full (Part V), in the built application.
 *
 *  1. THE LOST ADVISORY, reproduced and answered. A global hook that fails is switched off, so at teardown the run
 *     publishes the "Hooks need attention" advisory and its own outcome in one turn. The screen still holds the last
 *     of the burst — REQ-NOTIFY-024 makes single-slot replacement canonical — and the advisory is now READ BACK OUT
 *     OF THE SESSION'S TIMELINE, which is what REQ-NOTIFY-268 requires and what ADR-0049's Part C note found missing.
 *  2. Scoping (REQ-NOTIFY-028/029/058): a notice about another session survives a run start; an unscoped one does not.
 *  3. Compare-and-clear (REQ-NOTIFY-026): dismissing a superseded identifier leaves its successor standing.
 *  4. The ONE transient surface (REQ-NOTIFY-012/013/016/017/021): four published, three visible, newest nearest the
 *     corner, the widths and the 16 px inset measured against the window's own content box, and a view change clears.
 *  5. The presentations (REQ-NOTIFY-014/035/258): border and rule, never a filled background; the severity word in
 *     the accessible name; the four severities and the four kinds drawing one glyph set.
 *  6. The action carries its object, and the object is the one on screen (REQ-NOTIFY-044 as amended under ESC-34,
 *     REQ-NOTIFY-224): the unreviewed-hooks notice offers `open-hook-review` naming its workspace, and activating it
 *     opens REQ-HOOKS-106's review for THAT workspace. The identity main writes and the identity the renderer checks
 *     it against come from two different processes, so only the built application proves they are the same string.
 *  7. The retry action reaches its target (REQ-NOTIFY-045, REQ-NOTIFY-030, OQ-177): activated on a failed session, it
 *     resubmits that session's last submitted prompt as a second run of that session.
 *
 * Every assertion reads the application's own log, its store, or the rendered DOM.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'notice-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

function scenario(name, { globalHooks = null, workspaceHook = false } = {}) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# notice proof workspace\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    // Part T's shipped code_intelligence entry costs about 4.5 s per run start; this proof measures notices.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'runtime:', '  permission_mode: autonomous',
    // The project-setup task answered (REQ-WORKSPACE-081/111): `enabled: false` above does not make it inapplicable
    // (REQ-WORKSPACE-090), and without the bundled runtime its background run (REQ-WORKSPACE-083) fails and publishes
    // "Project setup did not finish" into the ONE notice slot this proof reads (REQ-NOTIFY-024) — in `review-action`
    // 0.8 s after the hook-review notice it replaced (REQ-NOTIFY-224).
    ...SETUP_ANSWERED, '',
    // REQ-HOOKS-013: a WORKSPACE hook is never trusted without review, so the summary reports `review` and
    // REQ-NOTIFY-224's notice is raised once the window is interactive.
    ...(workspaceHook ? ['hooks:', '  entries:', '    - event: pre_tool', '      command: "exit 0"', ''] : []),
  ].join('\n'));
  if (globalHooks !== null) {
    // The GLOBAL scope is trusted without review (REQ-HOOKS-013), so the run reaches the failure limit without a dialog.
    // By the platform that reads it (`configDirFor`), not the Windows spelling alone.
    const configDir = configDirFor(local);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'agents.yaml'), globalHooks);
  }
  return { root, workspace, local, preferences: join(root, 'preferences') };
}
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: opts.timeout ?? 150_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: s.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  // The precondition the section establishes, checked rather than assumed: a background setup's notice is not this proof's subject.
  if (backgroundSetupStarted(log)) throw new Error(`${name}: the workspace's initialization started code-intelligence-setup in the background, so its notice may stand in the slot this proof reads; see ${name}.log`);
  const errors = log.split('\n').filter((l) => /renderer console:/.test(l));
  return { log, png, elapsedMs: Date.now() - started, errors };
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inspectAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: inspect-at ${at} ${escape(selector)} → (\\{.*\\})`)); return m ? JSON.parse(m[1]) : null; };
const probesAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: probe-at ${at} ${escape(selector)} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
const noticeSteps = (log) => log.split('\n').filter((l) => /capture: notices at /.test(l)).map((l) => l.slice(l.indexOf('capture: notices at ')));
const results = {};
const expect = (cond, message) => { if (!cond) throw new Error(message); };
const open = (s) => new Database(oneDatabase(s.local), { readonly: true });
const timelineOf = (db) => db.prepare('SELECT session_id, name, actor, message, metadata, id, severity FROM timeline ORDER BY ordinal').all();

// ─────────────────────────────────────────────────────────────────────────────
// 1. The advisory the single slot loses is recorded before it is rendered (REQ-NOTIFY-268).
const s1 = scenario('advisory', {
  globalHooks: [
    '# a global hook that always fails: three failures switch it off (REQ-HOOKS-046), and the switched-off',
    '# advisory is published at teardown, a moment before the run\'s own outcome (REQ-HOOKS-054).',
    'hooks:', '  entries:', '    - event: pre_tool', '      command: "exit 1"', '',
  ].join('\n'),
});
{
  const r = await launch('advisory', s1, {
    ROTARIS_SCRIPT: 'read,read,read,read,answer',
    ROTARIS_CAPTURE_PROMPT: 'read a few files so the hook fails its way to being switched off',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '2500',
    ROTARIS_CAPTURE_PROBE: '[data-testid="notice-title"];;[data-testid="notice"]',
  }, { timeout: 180_000 });

  const db = open(s1);
  const rows = timelineOf(db);
  const session = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at DESC').get();
  db.close();
  const noticeRows = rows.filter((t) => t.name === 'notice');
  expect(/switched off|Hooks need attention/i.test(r.log), 'the run never switched the hook off, so no advisory was raised — see advisory.log');
  const advisory = noticeRows.find((t) => t.message === 'Hooks need attention');
  expect(advisory !== undefined, `the timeline holds ${JSON.stringify(noticeRows.map((t) => t.message))} — the advisory was not recorded (REQ-NOTIFY-268)`);
  const meta = JSON.parse(advisory.metadata);
  // REQ-NOTIFY-268: title, body and technical detail go in unchanged. The run host carries the advisory's sentence as
  // the notice's body (its text is prose, not diagnostic output), so that is the field the entry must hold.
  expect(meta.severity === 'warning' && typeof meta.message === 'string' && meta.message.length > 0, `the recorded entry carries ${JSON.stringify(meta)} — title, body and detail go in unchanged`);
  expect(advisory.actor === 'system' && advisory.session_id === session.session_id, `the entry was written as ${advisory.actor} on ${advisory.session_id}`);
  // REQ-SESSION-134 (schema v10, the repair of Part U's defect 42): the entry has its own 12-hex id, and the notice's
  // severity reaches the record's COLUMN — mapped from REQ-NOTIFY-023's vocabulary, which is not the timeline's.
  // Every hook_run entry the same run wrote carries an id too: nothing this run recorded is left without one.
  expect(/^[0-9a-f]{12}$/.test(advisory.id) && advisory.severity === 'warning', `the recorded entry's id and severity: ${JSON.stringify([advisory.id, advisory.severity])}`);
  expect(rows.every((t) => /^[0-9a-f]{12}$/.test(t.id)) && new Set(rows.map((t) => t.id)).size === rows.length, `an entry this run wrote carries no id, or two share one: ${JSON.stringify(rows.map((t) => [t.name, t.id]))}`);
  const hookRuns = rows.filter((t) => t.name === 'hook_run');
  expect(hookRuns.length > 0 && hookRuns.every((t) => t.severity === 'info' || t.severity === 'warning'), `REQ-HOOKS-119's severities: ${JSON.stringify(hookRuns.map((t) => t.severity))}`);
  expect(hookRuns.every((t) => JSON.parse(t.metadata).severity === undefined), `a hook_run entry still carries severity in its metadata: ${JSON.stringify(hookRuns.map((t) => t.metadata))}`);
  // The burst itself: the run's outcome and the advisory are published in the same turn of the loop, and the slot
  // holds ONE of them (REQ-NOTIFY-024). Which of the two wins is acceptance order and this proof does not fix it; what
  // it fixes is that both were published, exactly one is on screen, and the warning half is retrievable afterwards.
  const outcomeLogged = /run [0-9a-f-]+ ended /.test(r.log);
  const advisoryLogged = /notice from the run host: Hooks need attention/.test(r.log);
  expect(outcomeLogged && advisoryLogged, `the burst did not happen: outcome=${outcomeLogged}, advisory=${advisoryLogged}`);
  const onScreen = (r.log.match(/capture: probe \[data-testid="notice-title"\] → (\[.*\])/) ?? [])[1];
  const parsedScreen = onScreen ? JSON.parse(onScreen) : [];
  const shown = parsedScreen[0]?.text ?? null;
  expect(parsedScreen.length === 1, `the slot holds ${parsedScreen.length} notices; exactly one is current (REQ-NOTIFY-024)`);
  results.advisory = {
    sessionStatus: session.execution_status,
    recordedNotices: noticeRows.map((t) => ({ title: t.message, severity: JSON.parse(t.metadata).severity })),
    advisoryBody: meta.message.slice(0, 160),
    onScreenAfterTheBurst: shown,
    // Read in Part C the other way round (the outcome replaced the advisory); the acceptance order is what decides,
    // and neither is lost now: the warning is recorded, and the run's own outcome is in the session record.
    burst: { outcomePublished: outcomeLogged, advisoryPublished: advisoryLogged, slotHeld: parsedScreen.length },
    png: r.png, elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 and 3. Scoping and compare-and-clear, driven through the real store.
const s2 = scenario('scoping');
{
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const r = await launch('scoping', s2, {
    ROTARIS_CAPTURE_NOTICES: [
      // Unscoped, then a run starts: cleared (REQ-NOTIFY-058).
      step(2600, { op: 'report', severity: 'info', title: 'unscoped notice' }),
      step(3000, { op: 'run-start', sessionId: 'session-a' }),
      // About another session, then a run starts elsewhere: it stands (REQ-NOTIFY-029).
      step(3400, { op: 'report', severity: 'warning', title: 'about session b', sessionId: 'session-b' }),
      step(3800, { op: 'run-start', sessionId: 'session-a' }),
      // Its own session starting does clear it.
      step(4200, { op: 'run-start', sessionId: 'session-b' }),
      // Two publications; dismissing the FIRST leaves the second standing (REQ-NOTIFY-026).
      step(4600, { op: 'report', severity: 'info', title: 'first of two' }),
      step(5000, { op: 'report', severity: 'error', title: 'second of two', detail: 'a stack trace' }),
      // Identifier 4 is 'first of two' and 5 is 'second of two' (1 is the boot notice, 2 and 3 the two above): the
      // dismissal names the SUPERSEDED one, which must leave its successor standing (REQ-NOTIFY-026).
      step(5400, { op: 'dismiss', id: 4 }),
    ].join(';;'),
    ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="notice"]@3200;;[data-testid="notice"]@4000;;[data-testid="notice"]@4400;;[data-testid="notice"]@5800;;[data-testid="notice-detail"]@5800',
    ROTARIS_CAPTURE_AFTER_MS: '6400',
  });
  const title = (at) => inspectAt(r.log, at, '[data-testid="notice"]')?.matches[0]?.text?.split('\n')[0] ?? null;
  const count = (at) => inspectAt(r.log, at, '[data-testid="notice"]')?.matches.length ?? -1;
  expect(count(3200) === 0, `an unscoped notice survived a run start: ${JSON.stringify(inspectAt(r.log, 3200, '[data-testid="notice"]'))} (REQ-NOTIFY-058)`);
  expect(count(4000) === 1 && /about session b/.test(title(4000)), `a notice about another session did not survive an unrelated run start: ${title(4000)} (REQ-NOTIFY-029)`);
  expect(count(4400) === 0, 'the notice survived its own session starting (REQ-NOTIFY-029)');
  const after = inspectAt(r.log, 5800, '[data-testid="notice"]');
  expect(after?.matches.length === 1 && /second of two/.test(after.matches[0].text), `dismissing a superseded identifier removed the wrong notice: ${JSON.stringify(after?.matches.map((m) => m.text))} (REQ-NOTIFY-026)`);
  expect(after.matches[0].attrs['data-severity'] === 'error' && after.matches[0].attrs['role'] === 'alert', `the error presentation: ${JSON.stringify(after.matches[0].attrs)}`);
  expect(/Error: second of two/.test(after.matches[0].attrs['aria-label']), `the accessible name omits the severity word: ${after.matches[0].attrs['aria-label']} (REQ-NOTIFY-258)`);
  const detail = inspectAt(r.log, 5800, '[data-testid="notice-detail"]');
  expect(detail?.matches[0]?.text === 'a stack trace', `the detail row: ${JSON.stringify(detail?.matches[0]?.text)} (REQ-NOTIFY-037)`);
  results.scoping = {
    unscopedAfterRunStart: count(3200), otherSessionAfterRunStart: title(4000), ownSessionAfterRunStart: count(4400),
    afterDismissingTheSuperseded: after.matches[0].text.split('\n')[0], accessibleName: after.matches[0].attrs['aria-label'],
    steps: noticeSteps(r.log), png: r.png, elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 and 5. The one transient surface: depth, order, widths, inset, the clear on a view change, the presentations.
const s3 = scenario('stack');
{
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const r = await launch('stack', s3, {
    ROTARIS_CAPTURE_NOTICES: [
      // One alone: the wide presentation (REQ-NOTIFY-013).
      step(2600, { op: 'acknowledge', kind: 'info', title: 'alone' }),
      // Three more within the lifetime: the stack, the fourth evicting the oldest (REQ-NOTIFY-016).
      step(3200, { op: 'acknowledge', kind: 'ok', title: 'second' }),
      step(3400, { op: 'acknowledge', kind: 'warn', title: 'third', body: 'with a body' }),
      step(3600, { op: 'acknowledge', kind: 'fail', title: 'fourth' }),
    ].join(';;'),
    ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="acknowledgement"]@2900;;[data-testid="acknowledgement"]@3900;;[data-testid="acknowledgements"]@3900;;[data-testid="acknowledgement-title"]@3900;;[data-testid="acknowledgement"]@5200',
    // REQ-NOTIFY-021: a view change clears every visible acknowledgement.
    ROTARIS_CAPTURE_VIEWS: '4@4200',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="acknowledgement"]@4600',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'stack.png')}@3950`,
    ROTARIS_CAPTURE_AFTER_MS: '5600',
  });
  const alone = inspectAt(r.log, 2900, '[data-testid="acknowledgement"]');
  expect(alone?.matches.length === 1, `one acknowledgement was published and ${alone?.matches.length} are on screen`);
  expect(Math.round(alone.matches[0].rect.width) === 520, `a lone acknowledgement measured ${Math.round(alone.matches[0].rect.width)} px, not 520 (REQ-NOTIFY-013)`);
  const stacked = inspectAt(r.log, 3900, '[data-testid="acknowledgement"]');
  expect(stacked?.matches.length === 3, `four were published and ${stacked?.matches.length} are visible; three is the maximum (REQ-NOTIFY-016)`);
  // The titles from their own elements: a row's text is its glyph, its title, its body and its close control.
  const order = (inspectAt(r.log, 3900, '[data-testid="acknowledgement-title"]')?.matches ?? []).map((m) => m.text);
  expect(order[0] === 'second' && order[2] === 'fourth', `the stack reads ${JSON.stringify(order)} — the oldest went and the newest is nearest the corner (REQ-NOTIFY-016/017)`);
  const tops = stacked.matches.map((m) => m.rect.y);
  expect(tops[0] < tops[1] && tops[1] < tops[2], `the newest is not lowest: ${JSON.stringify(tops)} (REQ-NOTIFY-017)`);
  const gaps = [Math.round(tops[1] - (tops[0] + stacked.matches[0].rect.height)), Math.round(tops[2] - (tops[1] + stacked.matches[1].rect.height))];
  expect(gaps.every((g) => g === 8), `the gaps measured ${JSON.stringify(gaps)} px, not 8 (REQ-NOTIFY-017)`);
  expect(stacked.matches.every((m) => Math.round(m.rect.width) === 360), `a stacked acknowledgement measured ${JSON.stringify(stacked.matches.map((m) => Math.round(m.rect.width)))}, not 360 (REQ-NOTIFY-013)`);
  const stack = inspectAt(r.log, 3900, '[data-testid="acknowledgements"]');
  const view = stack.viewport ?? null;
  expect(view !== null, 'the inspect seam reported no viewport to measure the inset against');
  const right = Math.round(view.width - (stack.matches[0].rect.x + stack.matches[0].rect.width));
  const bottom = Math.round(view.height - (stack.matches[0].rect.y + stack.matches[0].rect.height));
  expect(right === 16 && bottom === 16, `the surface sits ${right} px from the right and ${bottom} px from the bottom of the window's content area, not 16 (REQ-NOTIFY-012)`);
  const kinds = stacked.matches.map((m) => m.attrs['data-kind']);
  const names = stacked.matches.map((m) => m.attrs['aria-label']);
  expect(JSON.stringify(kinds) === JSON.stringify(['ok', 'warn', 'fail']), `the kinds on screen: ${JSON.stringify(kinds)}`);
  expect(names[0].startsWith('Done.') && names[1].startsWith('Warning.') && names[2].startsWith('Failed.'), `the kind words are wrong: ${JSON.stringify(names)} (REQ-NOTIFY-019)`);
  const cleared = probesAt(r.log, 4600, '[data-testid="acknowledgement"]') ?? [];
  expect(cleared.length === 0, `a view change left ${cleared.length} acknowledgement(s) standing (REQ-NOTIFY-021)`);
  const expired = inspectAt(r.log, 5200, '[data-testid="acknowledgement"]');
  expect(expired?.matches.length === 0, `an acknowledgement outlived its 4200 ms: ${JSON.stringify(expired?.matches.map((m) => m.text))} (REQ-NOTIFY-011)`);
  results.stack = {
    aloneWidth: Math.round(alone.matches[0].rect.width), stackedWidths: stacked.matches.map((m) => Math.round(m.rect.width)),
    visible: stacked.matches.length, order, gaps, insetRight: right, insetBottom: bottom, kinds, accessibleNames: names,
    afterViewChange: cleared.length, afterLifetime: expired.matches.length,
    png: join(output, 'stack.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ESC-34: the review action names its workspace, and that name reaches the review.
const s4 = scenario('review-action', { workspaceHook: true });
{
  const r = await launch('review-action', s4, {
    ROTARIS_CAPTURE_AFTER_MS: '6000',
    // The notice is raised 800 ms after the workspace opens; probe it, then click its action.
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="notice-title"]@2500',
    ROTARIS_CAPTURE_INSPECT_AT: '.notice__action@2500',
    ROTARIS_CAPTURE_CLICKS: '.notice__action>>Review hooks@3200',
    // Leaving the review without choosing is a rejection (REQ-HOOKS-107); the proof chooses, so nothing is left open.
    ROTARIS_CAPTURE_HOOK_REVIEW: 'refuse', ROTARIS_CAPTURE_HOOK_REVIEW_MS: '900',
  });
  const titles = (probesAt(r.log, 2500, '[data-testid="notice-title"]') ?? []).map((m) => m.text);
  expect(titles.includes('Workspace hooks need review'), `the notice on screen: ${JSON.stringify(titles)} (REQ-NOTIFY-224)`);
  const actions = inspectAt(r.log, 2500, '.notice__action')?.matches ?? [];
  expect(actions.length === 1 && actions[0].text === 'Review hooks', `the notice offers ${JSON.stringify(actions.map((a) => a.text))} (REQ-NOTIFY-224)`);
  expect(actions[0].attrs['data-action'] === 'open-hook-review', `the action is ${actions[0].attrs['data-action']}, not the member REQ-NOTIFY-044 gained under ESC-34`);
  // The whole point of the parameter: main writes the workspace into the action, the renderer compares it with the
  // workspace it has open, and the review opens for THAT workspace. A mismatch in the form of the string — a slash, a
  // drive letter's case — would silently open nothing, and no unit test spans the two processes to catch it.
  const opened = r.log.match(/hook review opened for (.+) \((\d+) hook\(s\)\)/);
  expect(opened !== null, `the action was activated and no review opened — see review-action.log`);
  expect(!/is not the open workspace/.test(r.log), `the renderer refused the action's workspace: ${(r.log.match(/names .+ which is not the open workspace/) ?? [''])[0]}`);
  const sameRoot = opened[1].replace(/\\/g, '/').toLowerCase() === s4.workspace.replace(/\\/g, '/').toLowerCase();
  expect(sameRoot, `the review opened for ${opened[1]}, not for ${s4.workspace}`);
  results.reviewAction = {
    title: titles.find((t) => t === 'Workspace hooks need review') ?? null,
    actionLabel: actions[0].text, member: actions[0].attrs['data-action'],
    reviewOpenedFor: opened[1], hooks: Number(opened[2]), workspaceMatched: sameRoot,
    png: join(output, 'review-action.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REQ-NOTIFY-045 (OQ-177): the retry action reaches its target. A run fails at its first model call (a 401, which no
// recovery retries), so the session's last submitted prompt is the one that failed and the composer, submitted, is empty.
// No failure notice in this build carries the retry as its one action (OQ-177's reading: each failure class names
// another), so the proof publishes one carrying it through the REAL store, scoped to the failed session, and clicks it:
// the window resubmits the last submitted prompt to the session it follows, and a second run of that session starts on
// it. (Its outcome is the double's: a new iteration's root starts the script again, so it meets the same 401; what is
// measured is that the retry reached its target.) Before the repair of
// `docs/defects/fixed/the-retry-run-notice-action-has-no-target.md` the window logged "has no target" and nothing ran.
const s5 = scenario('retry-action');
{
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const PROMPT = 'the prompt that failed once';
  const r = await launch('retry-action', s5, {
    ROTARIS_SCRIPT: 'fail:401',
    ROTARIS_CAPTURE_PROMPT: PROMPT,
    ROTARIS_CAPTURE_NOTICES: step(6000, { op: 'report', severity: 'error', title: 'The run failed', message: 'Retry the failed run.', persistent: true, action: { label: 'Retry', action: { kind: 'retry-run' } } }),
    ROTARIS_CAPTURE_INSPECT_AT: '.notice__action@6600',
    ROTARIS_CAPTURE_CLICKS: '.notice__action>>Retry@7000',
    ROTARIS_CAPTURE_AFTER_MS: '14000',
  });
  const action = inspectAt(r.log, 6600, '.notice__action')?.matches ?? [];
  expect(action.length === 1 && action[0].text === 'Retry' && action[0].attrs['data-action'] === 'retry-run', `the notice offers ${JSON.stringify(action.map((a) => [a.text, a.attrs['data-action']]))}`);
  expect(/capture: clicked "Retry"/.test(r.log), 'the retry action was not clicked — see retry-action.log');
  expect(!/notice action "retry-run" has no target/.test(r.log), 'the window still dispatches retry-run nowhere');
  const db = open(s5);
  const sessions = db.prepare('SELECT session_id, execution_status, iterations_completed FROM sessions ORDER BY created_at').all();
  const users = sessions.length === 1 ? db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(sessions[0].session_id).map((row) => row.body) : [];
  db.close();
  expect(sessions.length === 1, `the retry went to ${sessions.length} sessions, not the one that failed (REQ-NOTIFY-030)`);
  expect(users.length === 2 && users.every((b) => b === PROMPT), `the session's submitted prompts: ${JSON.stringify(users)} — the retry did not resubmit the last one (REQ-NOTIFY-045)`);
  // The retried run is a second run of the same session: a second iteration, and an orchestrator call after the click.
  expect(sessions[0].iterations_completed === 2, `the retry started no second run of the session: ${JSON.stringify(sessions[0])}`);
  const afterClick = r.log.slice(r.log.indexOf('capture: clicked "Retry"'));
  expect(/scripted model call: [^\n]* \(orchestrator\)/.test(afterClick), 'no model call followed the retry');
  expect((r.log.match(/run [0-9a-f-]+ ended /g) ?? []).length === 2, `the session did not run twice: ${(r.log.match(/run [0-9a-f-]+ ended [^\n]*/g) ?? []).join(' | ')}`);
  results.retryAction = {
    actionLabel: action[0].text, member: action[0].attrs['data-action'], submittedPrompts: users,
    session: sessions[0], png: join(output, 'retry-action.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('\nPART V PROOF PASSED');
