import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, oneDatabase } from './lib/harness.mjs';

/**
 * Part W's first execution in the built application: the ONE action vocabulary reaching the screen three ways.
 *
 *  1. Ctrl+K opens the command palette — REQ-SHELL-051's dialog, measured; REQ-SHELL-052's filtering, auto-selection
 *     and close-then-run order, read from a mutation log; REQ-SHELL-053's hidden keywords, matched and never drawn.
 *  2. F1 opens keyboard help — REQ-SHELL-054's rows, one per shortcut-bearing command, with no Escape row and the
 *     prose line in its place; Escape closes it.
 *  3. ADR-0048's application modality, OBSERVED rather than assumed: with the palette open in the main window, a real
 *     operating-system click and real keystrokes aimed at the persona window change nothing in it; closing the palette
 *     gives it input again. Injected events are not used for this, because they enter the renderer below the host's
 *     input block and would pass through a disabled window.
 *  4. The shortcut table still carries the window: Ctrl+3, Ctrl+, and Ctrl+L, and Ctrl+Return declining while the send
 *     control is disabled (REQ-SHELL-049/050).
 *  5. The palette is reachable at the minimum window size (REQ-SHELL-022's 1000×680).
 *
 * Every assertion reads the built application's own log or its store; nothing is asserted from this script's model of
 * what should have happened.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const osInputScript = join(app, 'scripts', 'os-input.ps1');
const output = resolve(repo, '.palette-proof');
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




function scenario(name, extraYaml = []) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# palette proof workspace\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    // Since Part T the shipped code_intelligence entry is enabled by default and its discovery costs every run start
    // about 4.5 s (ADR-0035's note); this proof measures the shell, so the entry is off here.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'runtime:', '  permission_mode: autonomous', '  max_depth: 3', '  max_active_children: 4', ...extraYaml, '',
  ].join('\n'));
  return { root, workspace, local, preferences: join(root, 'preferences') };
}
function setPreference(s, key, value) {
  mkdirSync(s.preferences, { recursive: true });
  const file = join(s.preferences, 'preferences.json');
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, `${JSON.stringify({ ...current, [key]: value }, null, 2)}\n`);
}
function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), s.workspace], {
    cwd: app, encoding: 'utf8', timeout: opts.timeout ?? 150_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: s.local, APPDATA: join(dirname(s.local), 'roaming'), ROTARIS_PREFERENCES_ROOT: s.preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const errors = log.split('\n').filter((l) => /renderer console:/.test(l));
  return { log, png, elapsedMs: Date.now() - started, errors };
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `capture: inspect-at <ms> <selector> → {...}` — the rectangle, every attribute and the text of each match. */
const inspectAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: inspect-at ${at} ${escape(selector)} → (\\{.*\\})`)); return m ? JSON.parse(m[1]) : null; };
const textAt = (log, at, needle) => { const m = log.match(new RegExp(`capture: text-at ${at} ${escape(JSON.stringify(needle))} → (\\S+)`)); return m ? m[1] === 'true' : null; };
const orderAt = (log, at, phase) => { const m = log.match(new RegExp(`capture: order-at ${at} ${phase} → (\\{.*\\})`)); return m ? JSON.parse(m[1]) : null; };
const windowsAt = (log, at) => { const m = log.match(new RegExp(`capture: windows-at ${at} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
const personaProbesAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: persona-probe-at ${at} ${escape(selector)} → (\\[.*\\]|null)`)); return m ? JSON.parse(m[1]) : null; };
const osInputAt = (log, at, op) => { const m = log.match(new RegExp(`capture: os-input ${at} ${op}[^\\n]*→ (\\{.*\\}|[^\\n]*)`)); if (!m) return null; try { return JSON.parse(m[1]); } catch { return { raw: m[1] }; } };
const results = {};
const expect = (cond, message) => { if (!cond) throw new Error(message); };

// ─────────────────────────────────────────────────────────────────────────────
// 1. The palette: the dialog, the filter, the hidden keywords, the close-then-run order.
const s1 = scenario('palette');
{
  const r = launch('palette', s1, {
    ROTARIS_CAPTURE_CHORDS: 'Ctrl+K@3000;;Return@5200',
    ROTARIS_CAPTURE_TYPE_AT: 'config@4200',
    ROTARIS_CAPTURE_INSPECT_AT: [
      '[data-testid="command-palette"]@3600',
      '[data-testid="command-palette-filter"]@3600',
      '[data-testid="command-palette-list"]@3600',
      '.cmdk-item@3600',
      '.cmdk-heading@3600',
      '.cmdk-item@4800',
      '.app-shell@5800',
      '[data-testid="command-palette"]@5800',
    ].join(';;'),
    ROTARIS_CAPTURE_TEXT_AT: 'preferences@4800',
    ROTARIS_CAPTURE_ORDER_AT: 'arm@5000;;read@5600',
    ROTARIS_CAPTURE_AFTER_MS: '6400',
  });
  const dialog = inspectAt(r.log, 3600, '[data-testid="command-palette"]');
  expect(dialog && dialog.matches.length === 1, `Ctrl+K did not open exactly one palette: ${JSON.stringify(dialog)}`);
  const box = dialog.matches[0].rect;
  expect(Math.round(box.width) === 560 && Math.round(box.height) === 420, `the palette measured ${Math.round(box.width)}×${Math.round(box.height)}, not 560×420 (REQ-SHELL-051)`);
  expect(dialog.matches[0].attrs['aria-label'] === 'Rotaris command palette' && dialog.matches[0].attrs['aria-modal'] === 'true', `the dialog's names: ${JSON.stringify(dialog.matches[0].attrs)} (REQ-SHELL-051)`);
  expect(dialog.matches[0].attrs['data-title'] === 'Rotaris commands', 'the palette does not carry the title "Rotaris commands" (REQ-SHELL-051)');
  const filter = inspectAt(r.log, 3600, '[data-testid="command-palette-filter"]');
  expect(filter?.matches[0]?.attrs['placeholder'] === 'Type an action…' && filter.matches[0].attrs['aria-label'] === 'Filter commands', `the filter field: ${JSON.stringify(filter?.matches[0]?.attrs)} (REQ-SHELL-051)`);
  expect(filter.active?.testId === 'command-palette-filter', `the filter field did not hold focus on open: ${JSON.stringify(filter.active)}`);
  const list = inspectAt(r.log, 3600, '[data-testid="command-palette-list"]');
  expect(list?.matches[0]?.attrs['aria-label'] === 'Available commands' && list.matches[0].attrs['role'] === 'listbox', `the results list: ${JSON.stringify(list?.matches[0]?.attrs)} (REQ-SHELL-051)`);
  const heading = inspectAt(r.log, 3600, '.cmdk-heading');
  expect(heading?.matches[0]?.text === 'Commands', `the heading reads ${JSON.stringify(heading?.matches[0]?.text)} (REQ-SHELL-051)`);
  const all = inspectAt(r.log, 3600, '.cmdk-item')?.matches ?? [];
  // Wave 2 added exactly three commands to the registry, one per Part: `requirements.move` (AK'), `terminal.open` (AL')
  // and `run.compress` (AO), taking `COMMANDS` from six to nine and this list from thirteen to sixteen. The count was
  // pinned as a literal and nothing carried the growth to it, which is the sixtieth defect's shape a second time.
  expect(all.length === 16, `an empty query listed ${all.length} commands, not the registry's 16 (REQ-SHELL-052)`);
  expect(all[0].attrs['aria-selected'] === 'true' && all.slice(1).every((m) => m.attrs['aria-selected'] === 'false'), 'the first row was not the auto-selected one (REQ-SHELL-052)');
  const filtered = inspectAt(r.log, 4800, '.cmdk-item')?.matches ?? [];
  const filteredIds = filtered.map((m) => m.attrs['data-command']);
  expect(filteredIds.length > 0 && filteredIds.every((id) => id === 'view.settings' || id === 'settings.open'), `"config" matched ${JSON.stringify(filteredIds)} — it is a hidden keyword of Settings alone (REQ-SHELL-053)`);
  expect(filtered[0].attrs['aria-selected'] === 'true', 'the first row of a filtered set was not auto-selected (REQ-SHELL-052)');
  expect(textAt(r.log, 4800, 'preferences') === false, 'a hidden keyword was rendered on screen (REQ-SHELL-053)');
  const order = orderAt(r.log, 5600, 'read');
  expect(order && Array.isArray(order.events), `no mutation log was read: ${JSON.stringify(order)}`);
  const removed = order.events.find((e) => e.event === 'palette-removed');
  const changed = order.events.find((e) => e.event === 'view-changed');
  expect(removed && changed, `the log holds ${JSON.stringify(order.events)} — expected the palette's removal and the view change`);
  expect(removed.at <= changed.at, `the view changed at ${changed.at} ms before the palette left at ${removed.at} ms — activation must close first, then run (REQ-SHELL-052)`);
  expect(order.view === 'settings' && order.palette === false, `after Return the shell shows ${order.view} with the palette present=${order.palette}`);
  results.palette = {
    size: { width: Math.round(box.width), height: Math.round(box.height) },
    rows: all.length, filteredTo: filteredIds, keywordRendered: textAt(r.log, 4800, 'preferences'),
    closedAtMs: removed.at, viewChangedAtMs: changed.at, order: removed.at <= changed.at ? 'close-then-run' : 'run-then-close',
    endView: order.view, png: r.png, elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Keyboard help: a row per shortcut-bearing command, no Escape row, the prose line, Escape closes.
const s2 = scenario('help');
{
  const r = launch('help', s2, {
    ROTARIS_CAPTURE_CHORDS: 'F1@3000;;Escape@4600',
    ROTARIS_CAPTURE_INSPECT_AT: [
      '[data-testid="keyboard-help"]@3600',
      '.keyboard-help__row@3600',
      '[data-testid="keyboard-help-escape"]@3600',
      '.keyboard-help__chord@3600',
      '[data-testid="keyboard-help"]@5200',
    ].join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '5800',
  });
  const help = inspectAt(r.log, 3600, '[data-testid="keyboard-help"]');
  expect(help && help.matches.length === 1, `F1 did not open the keyboard help: ${JSON.stringify(help)} (REQ-SHELL-049)`);
  expect(help.matches[0].attrs['aria-modal'] === 'true', 'keyboard help is not application-modal (ADR-0048)');
  const rows = inspectAt(r.log, 3600, '.keyboard-help__row')?.matches ?? [];
  const chords = rows.map((m) => m.attrs['data-chord']);
  // Twelve became fourteen because wave 2 added two SHORTCUT-BEARING commands, `requirements.move` on Ctrl+M (AK')
  // and `terminal.open` on Ctrl+Shift+T (AL'). The third command it added, `run.compress` (AO), carries no chord and
  // so adds no row. The count of rows beyond the registry's own is unchanged at seven, which is why the delta is two.
  expect(rows.length === 14, `the help lists ${rows.length} rows; the registry has 14 shortcut-bearing rows (REQ-SHELL-054)`);
  expect(!chords.some((c) => /escape/i.test(c ?? '')), `an Escape row is present: ${JSON.stringify(chords)} (REQ-SHELL-048/054)`);
  expect(!rows.some((m) => /close current overlay/i.test(m.text ?? '')), 'the Escape entry is offered as a command (REQ-SHELL-048)');
  const prose = inspectAt(r.log, 3600, '[data-testid="keyboard-help-escape"]')?.matches[0]?.text ?? '';
  expect(/escape/i.test(prose) && /workspace/i.test(prose), `the Escape prose line reads ${JSON.stringify(prose)} (REQ-SHELL-054)`);
  const keycaps = inspectAt(r.log, 3600, '.keyboard-help__chord')?.matches ?? [];
  expect(keycaps.length === rows.length && keycaps.every((m) => typeof m.attrs['aria-label'] === 'string' && m.attrs['aria-label'].length > 0), 'a chord is not announced as one accessible name (REQ-SHELL-057)');
  const after = inspectAt(r.log, 5200, '[data-testid="keyboard-help"]');
  expect(after && after.matches.length === 0, `Escape did not close the keyboard help: ${JSON.stringify(after)} (REQ-SHELL-055)`);
  results.keyboardHelp = { rows: rows.length, chords, escapeLine: prose, closedByEscape: after.matches.length === 0, png: r.png, elapsedMs: r.elapsedMs };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ADR-0048's application modality, observed with the host's own input.
const s3 = scenario('modality');
{
  setPreference(s3, 'interface/agentPopOut', true);
  const r = launch('modality', s3, {
    ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,answer', ROTARIS_CHILD_SCRIPT: 'wait:34000,answer',
    ROTARIS_CAPTURE_PROMPT: 'pop out an agent for the modality reading',
    ROTARIS_CAPTURE_VIEWS: '3@3500',
    // The row is selected first and popped out after, the way Part R's proof does it — the control belongs to a selected row.
    ROTARIS_CAPTURE_CLICKS: '.agent-table__row@5000;;.agent-table__row .btn>>Pop out@7500',
    ROTARIS_CAPTURE_OS_INPUT_SCRIPT: osInputScript,
    // Before the palette: the persona window takes input. Then the palette opens, the same click and keystrokes are
    // aimed at it, and the host reports what it did. Then the palette closes and input is given back.
    ROTARIS_CAPTURE_WINDOWS_AT: '8500;;11200;;15200',
    ROTARIS_CAPTURE_OS_INPUT: 'where@8800;;click:.persona-window__tabs .tab@9200;;where@11400;;click:.persona-window__tabs .tab@11800;;type:zzz@12400;;where@15400',
    ROTARIS_CAPTURE_CHORDS: 'Ctrl+K@10600;;Escape@14400',
    ROTARIS_CAPTURE_PERSONA_PROBE_AT: '[data-testid="persona-agent-name"]@9600;;[data-testid="persona-agent-name"]@13000;;.persona-window__tabs .tab@13000',
    ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="command-palette"]@11200;;[data-testid="command-palette"]@15200',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
    timeout: 200_000,
  }, { timeout: 200_000 });
  const before = windowsAt(r.log, 8500) ?? [];
  expect(before.length === 1, `no persona window to aim at: ${JSON.stringify(before)}`);
  expect(before[0].enabled === true, `the persona window was already disabled before any modal surface: ${JSON.stringify(before[0])}`);
  const paletteOpen = inspectAt(r.log, 11200, '[data-testid="command-palette"]');
  expect(paletteOpen && paletteOpen.matches.length === 1, 'the palette was not open for the modality reading');
  const during = windowsAt(r.log, 11200) ?? [];
  expect(during[0]?.enabled === false, `with the palette open the persona window still takes input: ${JSON.stringify(during[0])} (ADR-0048)`);
  const hostDuring = osInputAt(r.log, 11400, 'where');
  expect(hostDuring && hostDuring.personaEnabled === false, `the host reports the persona window enabled while the palette is open: ${JSON.stringify(hostDuring)} (ADR-0048)`);
  const clickDuring = osInputAt(r.log, 11800, 'click');
  // A disabled window can still be RAISED by the host — Windows refuses the input, not the z-order — so being in the
  // foreground is not evidence either way. What the reading turns on is that the host reports the window disabled at
  // the moment of the click, and that the window's own content is unchanged by the click and the keystrokes after it.
  expect(clickDuring && clickDuring.personaEnabled === false, `a real click found the persona window enabled: ${JSON.stringify(clickDuring)} (ADR-0048)`);
  // The window's own content is unchanged by the click and the keystrokes that followed it.
  const nameBefore = personaProbesAt(r.log, 9600, '[data-testid="persona-agent-name"]')?.[0]?.text;
  const nameDuring = personaProbesAt(r.log, 13000, '[data-testid="persona-agent-name"]')?.[0]?.text;
  expect(nameBefore && nameDuring === nameBefore, `the persona window's content changed under a blocked click: ${nameBefore} → ${nameDuring} (ADR-0048)`);
  const after = windowsAt(r.log, 15200) ?? [];
  const paletteClosed = inspectAt(r.log, 15200, '[data-testid="command-palette"]');
  expect(paletteClosed && paletteClosed.matches.length === 0, 'the palette did not close on Escape');
  expect(after[0]?.enabled === true, `closing the palette did not give the persona window its input back: ${JSON.stringify(after[0])} (ADR-0048)`);
  const hostAfter = osInputAt(r.log, 15400, 'where');
  expect(hostAfter && hostAfter.personaEnabled === true, `the host still reports the persona window disabled after the palette closed: ${JSON.stringify(hostAfter)}`);
  expect(/application modality on: 1 persona window\(s\) disabled/.test(r.log) && /application modality off: 1 persona window\(s\) enabled/.test(r.log), 'main did not log the modality pair (ADR-0048)');
  results.modality = {
    enabledBefore: before[0].enabled, enabledDuring: during[0]?.enabled, enabledAfter: after[0]?.enabled,
    hostDuring: { personaEnabled: hostDuring.personaEnabled, foregroundIsPersona: hostDuring.foregroundIsPersona },
    clickDuring: { personaEnabled: clickDuring.personaEnabled, foregroundIsPersona: clickDuring.foregroundIsPersona, at: clickDuring.clickedAt, note: 'the host raises a disabled window but delivers it no input' },
    hostAfter: { personaEnabled: hostAfter.personaEnabled },
    personaContent: { before: nameBefore, during: nameDuring },
    png: r.png, elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The rest of the table still carries the window, and Ctrl+Return declines while the send control is disabled.
const s4 = scenario('shortcuts');
{
  const r = launch('shortcuts', s4, {
    ROTARIS_CAPTURE_CHORDS: 'Ctrl+3@3000;;Ctrl+,@4000;;Ctrl+L@5000;;Ctrl+Return@6000',
    ROTARIS_CAPTURE_INSPECT_AT: '.app-shell@3400;;.app-shell@4400;;.app-shell@5400;;.composer__input@5400;;.app-shell@6600',
    ROTARIS_CAPTURE_AFTER_MS: '7200',
  });
  const view = (at) => inspectAt(r.log, at, '.app-shell')?.matches[0]?.attrs['data-view'];
  expect(view(3400) === 'mission', `Ctrl+3 landed on ${view(3400)}, not the third view (REQ-SHELL-049)`);
  expect(view(4400) === 'settings', `Ctrl+, landed on ${view(4400)} (REQ-SHELL-049)`);
  expect(view(5400) === 'workspace', `Ctrl+L did not switch to Workspace: ${view(5400)} (REQ-SHELL-049)`);
  const composer = inspectAt(r.log, 5400, '.composer__input');
  expect(composer?.active?.className?.includes('composer__input'), `Ctrl+L did not put the caret in the composer: ${JSON.stringify(composer?.active)} (REQ-CHAT-002)`);
  expect(view(6600) === 'workspace', 'Ctrl+Return moved the view away from Workspace');
  // The composer is empty, so its send control is disabled and the fallback submit starts nothing (REQ-SHELL-049/050).
  const db = new Database(oneDatabase(s4.local), { readonly: true });
  const sessions = db.prepare('SELECT count(*) AS n FROM sessions').get();
  db.close();
  expect(sessions.n === 0, `Ctrl+Return started ${sessions.n} run(s) with the send control disabled (REQ-SHELL-049)`);
  results.shortcuts = { ctrl3: view(3400), ctrlComma: view(4400), ctrlL: view(5400), caret: composer?.active?.className, sessionsAfterCtrlReturn: sessions.n, png: r.png, elapsedMs: r.elapsedMs };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Reachable at the minimum window size (REQ-SHELL-022).
const s5 = scenario('minimum');
{
  const r = launch('minimum', s5, {
    ROTARIS_CAPTURE_RESIZE: '1000x680@2600',
    ROTARIS_CAPTURE_CHORDS: 'Ctrl+K@3400',
    ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="command-palette"]@4000;;.cmdk-item@4000',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'palette-minimum.png')}@4200`,
    ROTARIS_CAPTURE_AFTER_MS: '4800',
  });
  const dialog = inspectAt(r.log, 4000, '[data-testid="command-palette"]');
  expect(dialog && dialog.matches.length === 1, 'the palette did not open at the minimum window size');
  const box = dialog.matches[0].rect;
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1000 && box.y + box.height <= 680, `the palette lies outside a 1000×680 content area: ${JSON.stringify(box)} (REQ-SHELL-022)`);
  const rows = inspectAt(r.log, 4000, '.cmdk-item')?.matches ?? [];
  // The same list as the empty-query assertion above, at the minimum window size: sixteen since wave 2 added
  // `requirements.move`, `terminal.open` and `run.compress`. Pinned as a literal, and stale for the same reason.
  expect(rows.length === 16, `only ${rows.length} rows at the minimum size`);
  results.minimum = { rect: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }, rows: rows.length, png: join(output, 'palette-minimum.png'), elapsedMs: r.elapsedMs };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('\nPART W PROOF PASSED');
