/**
 * The Electron half of `pnpm terminal-proof` (Part AM, ADR-0047's first execution). Opens the bundled proof page in
 * a 900×620 window (REQ-SHELL-081's initial size), drives it with REAL input events through `webContents.sendInputEvent`
 * — keys, wheel notches, a pointer drag — and reads the DOM and the page's scripted log back through
 * `executeJavaScript`. Every assertion is collected, never thrown, so one run reports every finding; the outcome and
 * every measurement go to `results.json` and the exit code is 0 only when nothing failed.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const out = process.env.TERMINAL_PROOF_OUT;
const page = process.env.TERMINAL_PROOF_PAGE;
if (!out || !page) { console.error('TERMINAL_PROOF_OUT and TERMINAL_PROOF_PAGE are required'); app.exit(2); }
mkdirSync(out, { recursive: true });

const STREAM_A = 'fg:coder-1';
const STREAM_B = 'bg:0123456789abcdef0123';
const failures = [];
const results = {};
const expect = (name, condition, detail) => { results[name] = { pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) }; if (!condition) failures.push(`${name}: ${JSON.stringify(detail)}`); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The frame shape the manager ruled on 2026-09-09: `{ v, sessionId, streamId, seq, kind, payload, meta?, closing? }` (`v` is added by the page).
const frame = (streamId, seq, kind, payload, extra = {}) => ({ sessionId: 'proof-session', streamId, seq, kind, payload, ...extra });
// The run host's half of REQ-SHELL-100/106, scripted: the size the window last reported is the size the authoritative
// screen takes, and every later meta frame carries it — which is what keeps the preview's and the grid's cells identical.
let sizeA = { cols: 80, rows: 24 };
const metaA = (over = {}) => ({ streamId: STREAM_A, sessionId: 'proof-session', kind: 'agent', displayName: 'Coder 1', command: 'pytest -q tests/billing --maxfail=1 --durations=5', running: true, truncated: false, ...sizeA, acceptsInput: true, canKill: true, ...over });
const metaB = (over = {}) => ({ streamId: STREAM_B, sessionId: 'proof-session', kind: 'background', displayName: 'Background session 0123456789a…', running: true, truncated: true, cols: 80, rows: 24, acceptsInput: true, canKill: true, ...over });

// Harness finding (ADR-0047 first-execution note): on Windows, Chromium's native occlusion tracking reports a window that
// another window covers as `document.visibilityState === 'hidden'`, and the proof's window opens behind the shell that
// launched it. The product's tick gating on that state is REQ-SHELL-084's (an occluded window IS hidden); the proof
// disables the tracking so the window it drives counts as shown, and exercises hidden/shown through `win.hide()`/`show()`.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    // The proof page holds the window's content in a 900×620 box (REQ-SHELL-081's initial size) with the transcript
    // preview in a column BESIDE it, so the Electron window is wider than the box it measures and no taller — a
    // display's work area clamps a taller window and the proof would measure the clamp, not the box.
    width: 1540, height: 620, show: true, useContentSize: true,
    // Part AL2: the proof's preload gives the page the product's two verbs (a frame subscription, a command) for the live section.
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: true, ...(process.env.TERMINAL_PROOF_PRELOAD ? { preload: process.env.TERMINAL_PROOF_PRELOAD } : {}) },
  });
  const wc = win.webContents;
  const consoleErrors = [];
  const consoleAll = [];
  wc.on('console-message', (event) => { consoleAll.push(`${event.level}: ${event.message}`); if (event.level === 'error') consoleErrors.push(event.message); });
  const exec = (js) => wc.executeJavaScript(js, true);
  const state = (streamId = STREAM_A) => exec(`window.__terminalProof.state(${JSON.stringify(streamId)})`);
  const feed = (frames) => exec(`window.__terminalProof.feed(${JSON.stringify(frames)})`);
  const text = (selector) => exec(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? (e.textContent || '').trim() : null; })()`);
  const attr = (selector, name) => exec(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e ? e.getAttribute(${JSON.stringify(name)}) : null; })()`);
  const count = (selector) => exec(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const active = () => exec(`(() => { const a = document.activeElement; return a ? { tag: a.tagName, testid: a.getAttribute('data-testid'), label: a.getAttribute('aria-label') } : null; })()`);
  const rect = (selector) => exec(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const click = async (selector) => { const r = await rect(selector); if (!r) throw new Error(`no element ${selector}`); const x = Math.round(r.x + r.width / 2); const y = Math.round(r.y + r.height / 2); wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await pause(60); };
  const clickTop = async (selector) => { const r = await rect(selector); if (!r) throw new Error(`no element ${selector}`); const x = Math.round(r.x + r.width / 2); const y = Math.round(r.y + 12); wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 }); await pause(60); };
  const key = async (keyCode, modifiers = [], char = null) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (char !== null) wc.sendInputEvent({ type: 'char', keyCode: char, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(40);
  };
  const wheel = async (x, y, deltaY) => { wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, canScroll: true }); await pause(60); };
  let seqA = 300;
  const syncMeta = async () => {
    const last = (await state()).log.resize.filter((r) => r.streamId === STREAM_A).at(-1);
    if (last && (last.cols !== sizeA.cols || last.rows !== sizeA.rows)) { sizeA = { cols: last.cols, rows: last.rows }; await feed([frame(STREAM_A, seqA++, 'meta', '', { meta: metaA() })]); await pause(150); }
  };
  const resizeCount = async () => (await state()).log.resize.filter((r) => r.streamId === STREAM_A).length;
  const capture = async (name) => { const image = await wc.capturePage(); writeFileSync(join(out, `${name}.png`), image.toPNG()); return image; };
  const pixelAt = (image, x, y) => { const size = image.getSize(); const bitmap = image.toBitmap(); const scale = bitmap.length / (size.width * size.height * 4); const s = Math.sqrt(scale); const px = Math.round(x * s); const py = Math.round(y * s); const w = Math.round(size.width * s); const i = (py * w + px) * 4; return `#${bitmap[i + 2].toString(16).padStart(2, '0')}${bitmap[i + 1].toString(16).padStart(2, '0')}${bitmap[i].toString(16).padStart(2, '0')}`; };

  await win.loadFile(page);
  results.window = { contentSize: win.getContentSize(), inner: await wc.executeJavaScript('[window.innerWidth, window.innerHeight, window.devicePixelRatio]') };
  for (let i = 0; i < 100 && !(await exec('Boolean(window.__terminalProof && window.__terminalProof.ready)')); i += 1) await pause(50);
  await exec('document.fonts.ready.then(() => true)');
  await pause(300);

  try {
    // ── REQ-SHELL-083: the empty state, tabs hidden ──────────────────────────────────────────────────────────
    expect('empty.title', (await text('[data-testid="term-empty"] .empty-state-title')) === 'No terminal yet', await text('[data-testid="term-empty"] .empty-state-title'));
    expect('empty.body', (await text('[data-testid="term-empty"] .empty-state-hint')) === 'A terminal appears here as soon as an agent runs a shell command. Start a run in Workspace and this window fills itself.');
    expect('empty.tabsHidden', (await count('[data-testid="term-tablist"]')) === 0);
    const emptyRect = await rect('.term-empty__block');
    expect('empty.width', emptyRect && emptyRect.width <= 460, emptyRect);
    await click('[data-testid="term-go-to-workspace"]');
    expect('empty.action', (await state()).log.goToWorkspace === 1);

    // ── Two streams: 200 lines into A (scrollback), a background B ───────────────────────────────────────────
    const lines = Array.from({ length: 200 }, (_, i) => `line ${String(i + 1).padStart(3, '0')} of the scripted stream`);
    await feed([frame(STREAM_A, 1, 'screen', lines.slice(0, 24).join('\r\n'), { meta: metaA() })]);
    await feed(lines.slice(24).map((l, i) => frame(STREAM_A, 2 + i, 'delta', `\r\n${l}`)));
    await feed([frame(STREAM_B, 1, 'screen', 'background output', { meta: metaB() })]);
    await pause(400);
    results.debugAfterFeed = { ticks: await attr('[data-testid="term-window"]', 'data-ticks'), tabs: await attr('[data-testid="term-window"]', 'data-tabs'), testids: await exec(`[...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid'))`), streamExists: (await state()).stream.exists, listed: await exec(`window.__terminalProof.listed()`) };
    expect('tabs.count', (await count('[data-testid="term-tab-button"]')) === 2, results.debugAfterFeed);
    expect('tabs.label28', (await text('[data-testid="term-tab-button"][data-stream-id="fg:coder-1"] .term-window__tab-label')) === 'pytest -q tests/billing --m…');
    expect('tabs.labelBackground', (await text(`[data-testid="term-tab-button"][data-stream-id="${STREAM_B}"] .term-window__tab-label`)) === 'Background session 0123456789a…');
    expect('tabs.tooltipRunning', (await attr('[data-testid="term-tab-button"][data-stream-id="fg:coder-1"]', 'title')) === 'Coder 1 · running');
    expect('tabs.listName', (await attr('[data-testid="term-tablist"]', 'aria-label')) === 'Terminal sessions');
    expect('tabs.emptyGone', (await count('[data-testid="term-empty"]')) === 0);
    expect('header.command', (await text('[data-testid="term-command"]')) === '$ pytest -q tests/billing --maxfail=1 --durations=5');
    expect('header.commandName', (await attr('[data-testid="term-command"]', 'aria-label')) === 'Command');
    expect('header.outcome', (await text('[data-testid="term-outcome"]')) === 'running');
    expect('header.statusName', (await attr('[data-testid="term-status-dot"]', 'aria-label')) === 'Command status');
    expect('header.truncatedHiddenOnA', (await count('[data-testid="term-truncated"]')) === 0);
    const controlNames = await exec(`[...document.querySelectorAll('.term-tab__controls > *')].map((e) => e.getAttribute('aria-label') || e.className)`);
    expect('controls.order', JSON.stringify(controlNames) === JSON.stringify(['Take control of this terminal', 'Interrupt the running command', 'Send end of input to the running command', 'Input availability', 'term-tab__spacer', 'Copy all terminal output', 'Kill the process behind this terminal']), controlNames);
    expect('controls.killDescription', (await attr('[data-testid="term-kill"]', 'aria-description')) === 'Terminates the running process. Asks for confirmation first.');
    expect('focus.initialTakeControl', (await active())?.testid === 'term-take-control', await active());
    expect('a11y.gridName', (await count('[aria-label="Terminal output"]')) >= 1);
    expect('a11y.gridDescriptionReadOnly', (await attr('[data-testid="term-grid-input"]', 'aria-description')) === 'Live output of the running command. Shift+Tab leaves the terminal, Shift+Page Up scrolls back. Read-only until you take control.');

    // ── REQ-SHELL-100 first: the grid measured the host, reported once, and the scripted run host answered ──
    let s = await state();
    expect('geometry.reportedOnce', s.log.resize.filter((r) => r.streamId === STREAM_A).length === 1 && s.log.resize[0].cols >= 20 && s.log.resize[0].rows >= 4, s.log.resize);
    await syncMeta();
    s = await state();
    const rows = s.stream.grid.rows;
    expect('geometry.emulatorFollows', s.stream.grid.cols === sizeA.cols && rows === sizeA.rows && Number(await attr('[data-testid="term-grid"]', 'data-cols')) === sizeA.cols, { grid: [s.stream.grid.cols, rows], reported: sizeA });

    // ── REQ-SHELL-095: a grid, not a log ─────────────────────────────────────────────────────────────────────
    expect('grid.domRows', s.stream.grid.domRows === rows, { domRows: s.stream.grid.domRows, rows });
    expect('grid.historyRows', s.stream.grid.historyRows === 200 - rows, { historyRows: s.stream.grid.historyRows, rows });
    expect('grid.atTail', s.stream.grid.atTail === true);
    await feed([frame(STREAM_A, seqA++, 'delta', `\x1b[2;6HOVERWRITTEN\x1b[${rows};1H`)]);
    await pause(150);
    s = await state();
    // `ESC[2;6H` puts the cursor on row 2, column 6: the eleven characters that follow "line " are overwritten in place.
    expect('grid.cursorAddressing', /^line OVERWRITTEN/.test(s.stream.grid.lines[1]) && s.stream.grid.lines.length === rows, s.stream.grid.lines[1]);
    const beforeAlt = s.stream.grid.lines[0];
    await feed([frame(STREAM_A, seqA++, 'delta', '\x1b[?1049h\x1b[H\x1b[2JFULL SCREEN APP')]);
    await pause(150);
    s = await state();
    expect('grid.alternateEnter', s.stream.grid.alternate === true && s.stream.grid.lines[0] === 'FULL SCREEN APP', s.stream.grid.lines[0]);
    await feed([frame(STREAM_A, seqA++, 'delta', '\x1b[?1049l')]);
    await pause(150);
    s = await state();
    expect('grid.alternateLeave', s.stream.grid.alternate === false && s.stream.grid.lines[0] === beforeAlt, s.stream.grid.lines[0]);
    expect('preview.sameCells', JSON.stringify(s.stream.preview.lines) === JSON.stringify(s.stream.grid.lines.filter((l, i, a) => a.slice(i).some((x) => x !== ''))), { preview: s.stream.preview.lines.slice(0, 3), grid: s.stream.grid.lines.slice(0, 3) });
    expect('preview.running', (await attr('[data-testid="term-preview"]', 'data-running')) === 'true');
    expect('preview.stateRunning', (await text('[data-testid="term-preview-state"]')) === 'running · live screen', await text('[data-testid="term-preview-state"]'));
    await clickTop('[data-testid="term-preview-screen"]');
    expect('preview.clickOpens', JSON.stringify((await state()).log.openTerminal) === JSON.stringify([STREAM_A]));

    // ── Tab traversal reaches the grid ───────────────────────────────────────────────────────────────────────
    await click('[data-testid="proof-before-grid"]');
    await exec(`document.querySelector('[data-testid="term-take-control"]').focus()`);
    let reached = false;
    for (let i = 0; i < 8 && !reached; i += 1) { await key('Tab'); reached = (await active())?.testid === 'term-grid-input'; }
    expect('a11y.tabReachesGrid', reached, await active());

    // ── REQ-SHELL-090: unarmed printable → the read-only banner, once ─────────────────────────────────────────
    await key('x', [], 'x');
    expect('readOnly.banner', (await text('[data-testid="term-banner-title"]')) === 'This terminal is read-only' && (await text('[data-testid="term-banner-body"]')) === 'It belongs to the agent. Take control to send what you type to the command.');
    expect('readOnly.action', (await text('[data-testid="term-banner-action"]')) === 'Take control');
    const seqAfterFirst = await attr('[data-testid="term-banner-slot"]', 'data-banner-seq');
    await key('y', [], 'y');
    await key('Up');
    expect('readOnly.once', (await attr('[data-testid="term-banner-slot"]', 'data-banner-seq')) === seqAfterFirst, { seqAfterFirst, now: await attr('[data-testid="term-banner-slot"]', 'data-banner-seq') });
    expect('readOnly.nothingSent', (await state()).log.sendKeys.length === 0);
    expect('cursor.hollowWhileReadOnly', (await attr('[data-testid="term-cursor"]', 'data-shape')) === 'hollow' && (await exec(`document.querySelector('[data-testid="term-cursor"]').hidden`)) === false, await attr('[data-testid="term-cursor"]', 'data-shape'));

    // ── REQ-SHELL-089: arming through the banner's action ────────────────────────────────────────────────────
    await click('[data-testid="term-banner-action"]');
    expect('armed.label', (await text('[data-testid="term-take-control"]')) === 'Release control');
    expect('armed.banner', (await text('[data-testid="term-banner-title"]')) === 'You have control');
    expect('armed.gridFocused', (await active())?.testid === 'term-grid-input', await active());
    expect('armed.description', (await attr('[data-testid="term-grid-input"]', 'aria-description')) === 'Live output of the running command. You have control: what you type is sent to the command. Shift+Tab leaves the terminal, Shift+Page Up scrolls back.');
    expect('armed.audit', JSON.stringify((await state()).log.audit.map((a) => a.entry.kind)) === JSON.stringify(['took-control']));
    expect('cursor.filledWhileArmed', (await attr('[data-testid="term-cursor"]', 'data-shape')) === 'filled');

    // ── REQ-SHELL-096/097: keys forwarded; an unmapped key transmits nothing ─────────────────────────────────
    await key('a', [], 'a');
    await key('Up');
    await key('F5');
    await key('Insert');
    await key('Up', ['alt']);
    await key('Left', ['control']);
    await key('c', ['control']);
    s = await state();
    expect('keys.sent', JSON.stringify(s.log.sendKeys.map((k) => k.keys[0])) === JSON.stringify([{ kind: 'text', text: 'a' }, { kind: 'named', key: 'UP' }, { kind: 'named', key: 'C-c' }]), s.log.sendKeys);
    expect('keys.audit', JSON.stringify(s.log.audit.map((a) => a.entry)) === JSON.stringify([{ kind: 'took-control' }, { kind: 'line', text: 'a' }, { kind: 'control', text: 'C-c' }]), s.log.audit);
    await key('Tab', ['shift']);
    expect('keys.shiftTabLeaves', (await active())?.testid !== 'term-grid-input', await active());
    expect('keys.shiftTabNotSent', (await state()).log.sendKeys.length === 3);

    // ── REQ-SHELL-101: the wheel ─────────────────────────────────────────────────────────────────────────────
    await exec(`document.querySelector('[data-testid="term-grid-input"]').focus()`);
    const grid = await rect('[data-testid="term-grid"]');
    const gx = Math.round(grid.x + grid.width / 2);
    const gy = Math.round(grid.y + grid.height / 2);
    const before = (await state()).stream.grid.viewportY;
    await wheel(gx, gy, 100);
    let after = await state();
    const domDelta = after.log.wheel.at(-1)?.deltaY ?? 0;
    const expected = domDelta > 0 ? 3 : -3;
    expect('wheel.notch', after.stream.grid.viewportY - before === expected, { before, after: after.stream.grid.viewportY, domDelta });
    const beforeSub = after.stream.grid.viewportY;
    const arrivals = [];
    for (let i = 1; i <= 10; i += 1) { await wheel(gx, gy, 10); const v = (await state()).stream.grid.viewportY; if (v !== (arrivals.length ? arrivals.at(-1).v : beforeSub)) arrivals.push({ i, v }); }
    expect('wheel.subNotch', JSON.stringify(arrivals.map((a) => a.i)) === JSON.stringify([4, 7, 10]) && (await state()).stream.grid.viewportY - beforeSub === expected, arrivals);
    expect('cursor.hiddenOffTail', (await exec(`document.querySelector('[data-testid="term-cursor"]').hidden`)) === true);
    await key('End', ['shift']);
    expect('wheel.shiftEndReturnsToTail', (await state()).stream.grid.atTail === true);
    expect('keys.shiftEndNotSent', (await state()).log.sendKeys.length === 3);

    // ── REQ-SHELL-101: selection and copy ────────────────────────────────────────────────────────────────────
    s = await state();
    const cell = s.stream.grid.cell;
    const rowsRect = await rect('.xterm-rows');
    // xterm rounds a selection coordinate at the cell's CENTRE (Mouse.ts adds half a cell before the ceiling), so the
    // pointer goes down and up a fifth of the way into each cell.
    const at = (col, row) => ({ x: Math.round(rowsRect.x + (col + 0.2) * cell.width), y: Math.round(rowsRect.y + (row + 0.5) * cell.height) });
    const p1 = at(0, 2);
    const p2 = at(8, 3);
    wc.sendInputEvent({ type: 'mouseDown', x: p1.x, y: p1.y, button: 'left', clickCount: 1 });
    await pause(30);
    wc.sendInputEvent({ type: 'mouseMove', x: p2.x, y: p2.y, button: 'left', modifiers: ['leftButtonDown'] });
    await pause(30);
    wc.sendInputEvent({ type: 'mouseUp', x: p2.x, y: p2.y, button: 'left', clickCount: 1 });
    await pause(120);
    s = await state();
    const visible = s.stream.grid.lines;
    const range = s.stream.grid.selectionRange;
    const vy = s.stream.grid.viewportY;
    const expectedSelection = range ? `${visible[range.start.y - vy].slice(range.start.x).replace(/\s+$/, '')}\n${visible[range.end.y - vy].slice(0, range.end.x).replace(/\s+$/, '')}` : null;
    expect('selection.text', s.stream.grid.hasSelection && range && range.start.x === 0 && range.start.y - vy === 2 && range.end.y - vy === 3 && s.stream.grid.selectionText === expectedSelection && s.stream.grid.selectionText.startsWith('line 1'), { got: s.stream.grid.selectionText, expectedSelection, range });
    await key('c', ['control']);
    s = await state();
    expect('selection.ctrlCCopies', s.log.clipboard.length === 1 && s.log.clipboard[0] === expectedSelection && s.log.sendKeys.length === 3, { clipboard: s.log.clipboard, sent: s.log.sendKeys.length });
    expect('selection.copyAcknowledged', s.log.acks.some((a) => a.kind === 'ok' && a.title === 'Copied terminal output'));
    await exec(`window.__terminalProof.clearSelection(${JSON.stringify(STREAM_A)})`);
    await pause(50);
    await key('C', ['control', 'shift']);
    s = await state();
    expect('selection.emptyCopyFails', s.log.clipboard.length === 1 && s.log.acks.some((a) => a.kind === 'fail' && a.title === 'Nothing copied' && a.body === 'Nothing is selected.'), s.log.acks);
    expect('selection.emptyCopyNotSent', s.log.sendKeys.length === 3);

    // ── REQ-SHELL-094/092: a refusal, and the kill dialog ────────────────────────────────────────────────────
    await exec(`window.__terminalProof.refuse('interrupt', ${JSON.stringify(STREAM_A)}, 'ended')`);
    await click('[data-testid="term-interrupt"]');
    await pause(80);
    expect('refusal.banner', (await text('[data-testid="term-banner-title"]')) === 'The terminal did not take that' && (await text('[data-testid="term-banner-body"]')) === 'Rotaris could not interrupt the command. The process may have ended already.', await text('[data-testid="term-banner-body"]'));
    expect('refusal.auditControl', (await state()).log.audit.some((a) => a.entry.kind === 'control' && a.entry.text === 'C-c'));
    await click('[data-testid="term-kill"]');
    expect('kill.dialogTitle', (await text('[data-testid="term-kill-dialog"] .dialog-title')) === 'Kill this command?');
    expect('kill.dialogBody', (await text('[data-testid="term-kill-dialog"] .confirm-dialog__body')) === 'The process behind this terminal is terminated immediately.');
    const killLines = await exec(`[...document.querySelectorAll('[data-testid="term-kill-dialog"] .confirm-dialog__lines li')].map((e) => e.textContent)`);
    expect('kill.dialogLines', JSON.stringify(killLines) === JSON.stringify(['$ pytest -q tests/billing --maxfail=1 --durations=5', "The agent reads the killed command's output as its result.", 'Anything the command had not written yet is lost.']), killLines);
    expect('kill.confirmLabel', (await text('[data-testid="term-kill-dialog"] .btn-danger')) === 'Kill command');
    await key('Escape');
    expect('kill.declined', (await count('[data-testid="term-kill-dialog"]')) === 0 && (await state()).log.kill.length === 0);
    await click('[data-testid="term-kill"]');
    await click('[data-testid="term-kill-dialog"] .btn-danger');
    expect('kill.confirmed', JSON.stringify((await state()).log.kill) === JSON.stringify([STREAM_A]));
    expect('kill.audit', (await state()).log.audit.at(-1)?.entry.kind === 'kill');

    // ── REQ-SHELL-084: the tick repaints a BACKGROUND tab's header; it stops while hidden ────────────────────
    await syncMeta();
    await feed([frame(STREAM_B, 2, 'meta', '', { meta: metaB({ running: false, exitCode: 3 }) })]);
    await pause(300);
    expect('tick.backgroundHeader', (await attr(`[data-testid="term-tab-button"][data-stream-id="${STREAM_B}"]`, 'title')) === 'Background session 0123456789a… · exit 3' && (await attr(`[data-testid="term-tab-button"][data-stream-id="${STREAM_B}"] .status-dot`, 'data-state')) === 'idle', await attr(`[data-testid="term-tab-button"][data-stream-id="${STREAM_B}"]`, 'title'));
    expect('tick.frontUnchanged', (await text('[data-testid="term-outcome"]')) === 'running');
    const ticksBeforeHide = Number(await attr('[data-testid="term-window"]', 'data-ticks'));
    win.hide();
    await pause(200);
    const ticksAtHide = Number(await attr('[data-testid="term-window"]', 'data-ticks'));
    await feed([frame(STREAM_A, seqA++, 'meta', '', { meta: metaA({ running: false, exitCode: 0 }) })]);
    await pause(400);
    const ticksWhileHidden = Number(await attr('[data-testid="term-window"]', 'data-ticks'));
    const outcomeWhileHidden = await text('[data-testid="term-outcome"]');
    win.show();
    await pause(400);
    const ticksAfterShow = Number(await attr('[data-testid="term-window"]', 'data-ticks'));
    expect('tick.stopsHidden', ticksWhileHidden === ticksAtHide && outcomeWhileHidden === 'running', { ticksBeforeHide, ticksAtHide, ticksWhileHidden, outcomeWhileHidden });
    expect('tick.resumesShown', ticksAfterShow > ticksWhileHidden && (await text('[data-testid="term-outcome"]')) === 'exit 0', { ticksAfterShow, outcome: await text('[data-testid="term-outcome"]') });

    // ── REQ-SHELL-091: exited ───────────────────────────────────────────────────────────────────────────────
    expect('exit.banner', (await text('[data-testid="term-banner-title"]')) === 'Process exited' && (await text('[data-testid="term-banner-body"]')) === 'exit 0. The output stays readable and copyable.');
    expect('exit.disarmed', (await text('[data-testid="term-take-control"]')) === 'Take control' && (await exec(`document.querySelector('[data-testid="term-take-control"]').disabled`)) === true);
    const disabledReasons = await exec(`['term-take-control','term-interrupt','term-end-input','term-kill'].map((t) => { const e = document.querySelector('[data-testid="' + t + '"]'); return [e.disabled, e.getAttribute('aria-description'), e.getAttribute('title')]; })`);
    expect('exit.controlsDisabledWithReason', disabledReasons.every(([d, desc, title]) => d === true && desc === 'The process has ended, so it cannot accept input.' && title === desc), disabledReasons);
    expect('exit.helpReachable', (await exec(`document.querySelector('[data-testid="term-help"]').disabled`)) === false && (await attr('[data-testid="term-help"]', 'aria-description')) === 'The process has ended, so it cannot accept input.');
    expect('exit.tabTooltip', (await attr('[data-testid="term-tab-button"][data-stream-id="fg:coder-1"]', 'title')) === 'Coder 1 · exit 0');
    expect('exit.previewState', (await text('[data-testid="term-preview-state"]')) === 'exit 0');
    await exec(`document.querySelector('[data-testid="term-grid-input"]').focus()`);
    await key('z', [], 'z');
    expect('exit.inputIgnored', (await state()).log.sendKeys.length === 3 && (await text('[data-testid="term-banner-title"]')) === 'Process exited');
    expect('cursor.hiddenAfterExit', (await exec(`document.querySelector('[data-testid="term-cursor"]').hidden`)) === true);
    await exec(`window.__terminalProof.clearSelection(${JSON.stringify(STREAM_A)})`);
    await click('[data-testid="term-copy-all"]');
    await pause(60);
    s = await state();
    expect('copyAll.readable', s.log.clipboard.length === 2 && s.log.clipboard[1].includes('line 001 of the scripted stream') && s.log.clipboard[1].includes('FULL SCREEN APP') === false, s.log.clipboard[1]?.slice(0, 80));

    // ── REQ-SHELL-100: geometry — never from a hidden host, re-measured on theme change, reported on change only ──
    await syncMeta();
    s = await state();
    const reportsSoFar = await resizeCount();
    // A banner arriving changes the host's height, so by now more than one geometry has been reported; each report
    // is asserted as a DELTA from here on. That the banners moved the grid is itself REQ-SHELL-100 working.
    results.geometryReportsBeforeHideTest = s.log.resize;
    const gridRect = await rect('[data-testid="term-grid"]');
    const screenRect = await rect('.term-grid__screen');
    expect('geometry.gutter6', Math.round(screenRect.x - gridRect.x) === 6 && Math.round(screenRect.y - gridRect.y) === 6, { gridRect, screenRect });
    await exec(`document.querySelector('.term-window__panel').style.display = 'none'`);
    await pause(200);
    await feed([frame(STREAM_A, seqA++, 'delta', '\r\nafter hide')]);
    await pause(200);
    await exec(`document.querySelector('.term-window__panel').style.display = ''`);
    await pause(250);
    s = await state();
    expect('geometry.hiddenNeverReported', (await resizeCount()) === reportsSoFar, s.log.resize);
    const themeBefore = s.termBg;
    await exec(`window.__terminalProof.theme('high-contrast')`);
    await pause(350);
    s = await state();
    const screenBg = await exec(`getComputedStyle(document.querySelector('.term-grid')).backgroundColor`);
    expect('theme.tokenChanged', s.theme === 'high-contrast' && s.termBg !== themeBefore, { themeBefore, now: s.termBg });
    expect('theme.sameFaceNoReport', (await resizeCount()) === reportsSoFar, s.log.resize);
    const image = await capture('window-high-contrast');
    const sampled = pixelAt(image, Math.round(gridRect.x + 2), Math.round(gridRect.y + 2));
    expect('theme.gutterPaintedWithTermBg', sampled === s.termBg, { sampled, token: s.termBg, cssBackground: screenBg });
    // The high-contrast ground, read from the resolved token (never a literal: tools/check-theme-colours.mjs walks this file).
    const highContrastTermBg = s.termBg;
    const reportsBefore = Number(await attr('[data-testid="term-grid"]', 'data-geometry-reports'));
    await exec(`window.__terminalProof.font(16)`);
    await pause(400);
    s = await state();
    const reportsAfter = Number(await attr('[data-testid="term-grid"]', 'data-geometry-reports'));
    const resizes = s.log.resize.filter((r) => r.streamId === STREAM_A);
    expect('theme.remeasureReportsOnce', resizes.length === reportsSoFar + 1 && reportsAfter === reportsBefore + 1 && resizes.at(-1).cols < resizes.at(-2).cols && s.stream.grid.cols === resizes.at(-1).cols, { resizes, reportsBefore, reportsAfter });
    await exec(`window.__terminalProof.font(null)`);
    await exec(`window.__terminalProof.theme('rotaris-dim')`);
    await pause(350);
    s = await state();
    const dimImage = await capture('window-rotaris-dim');
    const dimGridRect = await rect('[data-testid="term-grid"]');
    const dimSampled = pixelAt(dimImage, Math.round(dimGridRect.x + 2), Math.round(dimGridRect.y + 2));
    expect('theme.gutterPaintedWithTermBgDim', dimSampled === s.termBg && s.termBg !== highContrastTermBg && dimSampled !== sampled, { sampled: dimSampled, token: s.termBg, highContrastTermBg });

    // ── REQ-SHELL-085: bringing forward only a retained stream; a new session clears everything ────────────
    await exec(`window.__terminalProof.focusStream(${JSON.stringify(STREAM_B)})`);
    await pause(300);
    expect('forward.retained', (await attr('[data-testid="term-window"]', 'data-front')) === STREAM_B);
    expect('forward.truncationOnB', (await text('[data-testid="term-truncated"]')) === 'Earlier output dropped' && (await attr('[data-testid="term-truncated"]', 'aria-label')) === 'Scrollback limit reached');
    await exec(`window.__terminalProof.focusStream('fg:never-seen')`);
    await pause(300);
    expect('forward.unknownIgnored', (await attr('[data-testid="term-window"]', 'data-front')) === STREAM_B);
    await exec(`window.__terminalProof.clear()`);
    await pause(300);
    expect('clear.emptyState', (await count('[data-testid="term-empty"]')) === 1 && (await count('[data-testid="term-tab-button"]')) === 0);
    await capture('window-empty');
  } catch (error) {
    failures.push(`harness: ${error && error.stack ? error.stack : String(error)}`);
  }

  // ── Part AL2 — REQ-SHELL-166 against a REAL pseudo-terminal, through the window ──────────────────────────────
  // The run-host half is `harness.cjs` (a Node child: the real terminal manager over a real PowerShell PTY, the real
  // `createTerminalHost`, the real `FrameDeliveryLimiter` over a real `UpdateRelay`); this process relays its frames to
  // the page on the proof's preload channel and the page's `terminal.*` requests back to it — one hop each way, as in
  // the product. Every key below is a REAL input event; every reading is the page's own. The echo program is a Node
  // script in raw mode: it echoes what it receives, and acts on Ctrl-C (exit 130) and Ctrl-D (exit 0), so the two
  // controls REQ-SHELL-166 names are observable on Windows, where a shell's own Ctrl-C ends the wrapped line and its
  // exit marker with it.
  const LIVE = 'fg:live-1';
  const harnessPath = process.env.TERMINAL_PROOF_HARNESS;
  const live = {};
  results.live = live;
  let child = null;
  try {
    if (!harnessPath) throw new Error('TERMINAL_PROOF_HARNESS is not set');
    const { spawn } = require('node:child_process');
    const { createInterface } = require('node:readline');
    child = spawn(process.execPath, [harnessPath], { cwd: process.env.TERMINAL_PROOF_REPO ?? process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const pendingReplies = new Map();
    const harnessLog = [];
    let nextId = 1;
    let readyResolve = null;
    const ready = new Promise((resolve) => { readyResolve = resolve; });
    const frameLog = [];
    createInterface({ input: child.stdout }).on('line', (line) => {
      let m;
      try { m = JSON.parse(line); } catch { harnessLog.push(`unparsed: ${line.slice(0, 200)}`); return; }
      if (m.ready) { readyResolve(m); return; }
      if (m.log) { harnessLog.push(m.log); return; }
      if (m.fatal) { harnessLog.push(`fatal: ${m.fatal}`); return; }
      if (m.frame) { frameLog.push({ seq: m.frame.seq, kind: m.frame.kind, streamId: m.frame.streamId, at: Date.now() }); if (!wc.isDestroyed()) wc.send('proof:frame', m.frame); return; }
      const p = pendingReplies.get(m.id);
      if (!p) return;
      if (m.started) { p.started(m); return; }
      pendingReplies.delete(m.id);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
    });
    createInterface({ input: child.stderr }).on('line', (line) => harnessLog.push(`stderr: ${line.slice(0, 300)}`));
    const ask = (op, body = {}) => new Promise((resolve, reject) => { const id = nextId++; pendingReplies.set(id, { resolve, reject, started: () => undefined }); child.stdin.write(`${JSON.stringify({ id, op, ...body })}\n`); });
    /** A command in the PTY: `started` resolves when the run host took it, `done` with the tool's result. */
    const run = (command, extra = {}) => {
      const id = nextId++;
      let started;
      const startedP = new Promise((resolve) => { started = resolve; });
      const done = new Promise((resolve, reject) => { pendingReplies.set(id, { resolve, reject, started }); });
      child.stdin.write(`${JSON.stringify({ id, op: 'run', command, ...extra })}\n`);
      return { started: startedP, done };
    };
    // The page's requests, shape for shape, to the real run-host handler; the reply as the product's `CommandOutcome`.
    ipcMain.handle('proof:command', async (_event, request) => {
      const r = await ask('terminal', { request });
      const reply = r.reply;
      if (reply.kind === 'refused') return { ok: false, code: reply.code, headline: reply.headline };
      if (reply.kind === 'terminal.streams') return { ok: true, value: reply.streams };
      return { ok: true };
    });
    const until = async (pred, ms, every = 10) => { const t0 = Date.now(); for (;;) { const v = await pred(); if (v) return v; if (Date.now() - t0 > ms) return null; await pause(every); } };
    // No pause between the three events, and Shift held for a capital (Electron lower-cases a `char` sent without it).
    const burst = (keyCode, char = null) => { const modifiers = /^[A-Z]$/.test(keyCode) ? ['shift'] : []; wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); if (char !== null) wc.sendInputEvent({ type: 'char', keyCode: char, modifiers }); wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); };
    const trimmed = (lines) => { const out = [...(lines ?? [])]; while (out.length > 0 && out[out.length - 1] === '') out.pop(); return out; };

    const readyMessage = await until(() => ready.then((m) => m).catch(() => null), 30_000, 50);
    if (!readyMessage) throw new Error(`the harness did not become ready: ${harnessLog.join(' | ')}`);
    live.shell = readyMessage.shell;
    const { writeFileSync: writeEcho } = require('node:fs');
    // Under `out/`, which the lint's ignore list covers (`**/out/**`): the script is proof output, not source.
    const echoScript = join(out, 'out', 'echo.cjs');
    writeEcho(echoScript, [
      "const stdin = process.stdin; stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');",
      "process.stdout.write('READY\\r\\n');",
      "stdin.on('data', (d) => { for (const ch of d) {",
      "  if (ch === '\\x03') { process.stdout.write('\\r\\nINTERRUPTED\\r\\n'); process.exit(130); }",
      "  if (ch === '\\x04') { process.stdout.write('\\r\\nEOF\\r\\n'); process.exit(0); }",
      "  process.stdout.write(ch === '\\r' ? '\\r\\n' : ch);",
      '} });',
    ].join('\n'));
    const echoCommand = `node "${echoScript}"`;

    await exec(`window.__terminalProof.live(${JSON.stringify(LIVE)})`);
    await exec(`window.__terminalProof.focusStream(${JSON.stringify(LIVE)})`);
    // ── The window fills from the real stream; the row preview follows (REQ-SHELL-079/104) ──────────────────
    const first = run(echoCommand);
    await first.started;
    const tabUp = await until(() => attr(`[data-testid="term-tab-button"][data-stream-id="${LIVE}"]`, 'data-running'), 8_000);
    expect('live.tabFromRealStream', tabUp === 'true', { tabUp, frames: frameLog.slice(0, 5), log: harnessLog.slice(-5) });
    const readyOnGrid = await until(async () => { const st = await state(LIVE); return st.stream.grid && st.stream.grid.lines.some((l) => l.startsWith('READY')) ? st : null; }, 8_000);
    expect('live.readyPainted', readyOnGrid !== null, readyOnGrid ? readyOnGrid.stream.grid.lines.slice(0, 3) : null);
    expect('live.previewFollows', readyOnGrid !== null && readyOnGrid.stream.preview && readyOnGrid.stream.preview.lines.some((l) => l.startsWith('READY')) && (await attr('[data-testid="term-preview"]', 'data-stream-id')) === LIVE, readyOnGrid ? readyOnGrid.stream.preview : null);
    expect('live.headerCommand', (await text('[data-testid="term-command"]')) === `$ ${echoCommand}` && (await text('[data-testid="term-outcome"]')) === 'running', await text('[data-testid="term-command"]'));
    // ── REQ-SHELL-100/106: the grid's geometry reached the PTY and came back in the stream's meta ──────────────
    const reported = await until(async () => { const st = await state(LIVE); const last = st.log.resize.filter((r) => r.streamId === LIVE).at(-1); return last && st.stream.meta && st.stream.meta.cols === last.cols && st.stream.meta.rows === last.rows ? { last, meta: [st.stream.meta.cols, st.stream.meta.rows], grid: [st.stream.grid.cols, st.stream.grid.rows] } : null; }, 5_000);
    expect('live.metaFollowsReportedGeometry', reported !== null && reported.grid[0] === reported.last.cols && reported.grid[1] === reported.last.rows, reported ?? (await state(LIVE)).log.resize);
    live.geometry = reported;
    // ── REQ-SHELL-166: a resize WHILE the command runs — the window's box shrinks, as under a user's drag ───────
    // The grid re-measures its host, reports the new geometry (REQ-SHELL-100) and the run host resizes the real
    // pseudo-terminal (REQ-SHELL-106). This is defect AL2-3's remaining trigger, and the proof drives it on purpose:
    // with the banner slot's height reserved nothing else on this path resizes mid-command, so without this the
    // evidence recorded below (`live.resizeRepaint`) would not be produced by the runs the records quote.
    const reportsBeforeResize = (await state(LIVE)).log.resize.filter((r) => r.streamId === LIVE).length;
    const boxHeight = await exec(`(() => { const box = document.querySelector('[data-testid="proof-window"]'); box.style.height = '460px'; return box.getBoundingClientRect().height; })()`);
    const midResize = await until(async () => {
      const st = await state(LIVE);
      const reports = st.log.resize.filter((r) => r.streamId === LIVE);
      const last = reports.at(-1);
      return reports.length > reportsBeforeResize && last && st.stream.meta && st.stream.grid && st.stream.meta.cols === last.cols && st.stream.meta.rows === last.rows
        ? { reports: reports.length, last, meta: [st.stream.meta.cols, st.stream.meta.rows], grid: [st.stream.grid.cols, st.stream.grid.rows] }
        : null;
    }, 8_000);
    live.midCommandResize = { boxHeight, before: reported ? reported.last : null, after: midResize ? midResize.last : null, meta: midResize ? midResize.meta : null, grid: midResize ? midResize.grid : null, reports: midResize ? midResize.reports : null };
    expect('live.midCommandResizeReachedProcess', midResize !== null && reported !== null && midResize.last.rows !== reported.last.rows && midResize.grid[1] === midResize.last.rows, live.midCommandResize);
    // ConPTY answers the resize with a repaint (defect AL2-3, below), which is a burst of frames. REQ-SHELL-166's
    // echo budget is for a keystroke, not for a keystroke queued behind a screen repaint, so the probes wait for the
    // stream to go quiet first — the same rest the criterion is stated at.
    const quietFrom = Date.now();
    await until(() => (frameLog.length > 0 && Date.now() - frameLog[frameLog.length - 1].at > 250 ? true : null), 4_000, 25);
    live.midCommandResize.quietMs = Date.now() - quietFrom;
    // ── Take control (REQ-SHELL-089), then REQ-SHELL-166's echo: key press to painted frame ─────────────────────
    await click('[data-testid="term-take-control"]');
    expect('live.armed', (await text('[data-testid="term-take-control"]')) === 'Release control' && (await active())?.testid === 'term-grid-input', await active());
    const echoes = [];
    for (const sentinel of ['q', 'w', 'e']) {
      await exec(`window.__terminalProof.echoProbe(${JSON.stringify(sentinel)})`);
      await key(sentinel, [], sentinel);
      const probe = await until(async () => { const st = await state(LIVE); return st.echo && st.echo.paintedAt !== null ? st.echo : null; }, 3_000, 5);
      echoes.push(probe ? { sentinel, keyToFrameMs: Number((probe.frameAt - probe.pressedAt).toFixed(1)), keyToPaintMs: Number((probe.paintedAt - probe.pressedAt).toFixed(1)) } : { sentinel, keyToFrameMs: null, keyToPaintMs: null });
      await pause(60);
    }
    await exec('window.__terminalProof.echoProbe(null)');
    live.echo = echoes;
    const worstEcho = Math.max(...echoes.map((e) => e.keyToPaintMs ?? Number.POSITIVE_INFINITY));
    expect('live.echoUnder100ms', echoes.every((e) => e.keyToPaintMs !== null) && worstEcho < 100, echoes);
    await key('Enter');
    // ── REQ-SHELL-096/166: order and fidelity — a burst of keys, two unmapped keys inside it, nothing invented ────
    const typed = 'abc123XYZ';
    const sentBefore = (await state(LIVE)).log.sendKeys.length;
    for (const [i, ch] of [...typed].entries()) { burst(ch, ch); if (i === 3) burst('F5'); if (i === 6) burst('Insert'); }
    const echoedLine = await until(async () => { const st = await state(LIVE); const line = st.stream.grid.lines.find((l) => l.startsWith(typed)); return line ? st : null; }, 5_000);
    expect('live.orderAndFidelityOnGrid', echoedLine !== null && echoedLine.stream.grid.lines.some((l) => l === typed), echoedLine ? echoedLine.stream.grid.lines.slice(0, 6) : null);
    const sentBurst = (await state(LIVE)).log.sendKeys.slice(sentBefore);
    expect('live.unmappedTransmitNothing', sentBurst.length === typed.length && sentBurst.map((k) => k.keys[0].text).join('') === typed, sentBurst.map((k) => k.keys[0]));
    await key('Enter');
    // ── REQ-SHELL-166: end input within 500 ms; the command's output is exactly what was typed (REQ-SHELL-096) ───
    const t0End = Date.now();
    await click('[data-testid="term-end-input"]');
    const firstDone = await Promise.race([first.done, pause(5_000).then(() => null)]);
    const endInputMs = Date.now() - t0End;
    live.endInput = { ms: endInputMs, exitCode: firstDone?.result.exitCode ?? null, output: firstDone?.result.output ?? null };
    expect('live.endInputUnder500ms', firstDone !== null && endInputMs < 500 && /EOF\s*$/.test(firstDone.result.output) && firstDone.result.exitCode === 0, live.endInput);
    const outLines = (firstDone?.result.output ?? '').split('\n').map((l) => l.trim());
    expect('live.fidelityInProcess', outLines.includes(typed) && outLines.filter((l) => l === 'qwe').length === 1 && outLines.filter((l) => l === typed).length === 1, outLines);
    // Defect AL2-3, measured and NOT repaired here: a PTY resize while a command runs makes ConPTY repaint its viewport,
    // and the observation captured from the raw bytes carries the repainted text a second time ("READY" twice, the
    // start marker inside the body, a screen's worth of blank lines). The capture is ADR-0020's VT-strip over raw
    // bytes; the repair is an observation derived from the screen model, an ADR-0020 revision — recorded, not made.
    live.resizeRepaint = { readyLines: outLines.filter((l) => l === 'READY').length, markerInBody: outLines.some((l) => /^__rot_[0-9a-f]+_s$/.test(l)), lines: outLines.length };
    // The window shows the exit (REQ-SHELL-091) and the previews agree (REQ-SHELL-102).
    const exited = await until(async () => ((await text('[data-testid="term-outcome"]')) === 'exit 0' ? true : null), 3_000);
    expect('live.exitShown', exited === true && (await text('[data-testid="term-preview-state"]')) === 'exit 0', await text('[data-testid="term-outcome"]'));
    // ── REQ-SHELL-166: interrupt within 500 ms; REQ-SHELL-107's audit entries as spec 12 words them ─────────────
    const second = run(echoCommand);
    await second.started;
    const readyAgain = await until(async () => ((await text('[data-testid="term-outcome"]')) === 'running' ? true : null), 8_000);
    expect('live.secondCommandReopensStream', readyAgain === true, await text('[data-testid="term-outcome"]'));
    await pause(300);
    const t0Int = Date.now();
    await click('[data-testid="term-interrupt"]');
    const secondDone = await Promise.race([second.done, pause(5_000).then(() => null)]);
    const interruptMs = Date.now() - t0Int;
    live.interrupt = { ms: interruptMs, exitCode: secondDone?.result.exitCode ?? null, output: secondDone?.result.output ?? null };
    expect('live.interruptUnder500ms', secondDone !== null && interruptMs < 500 && /INTERRUPTED/.test(secondDone.result.output) && secondDone.result.exitCode === 130, live.interrupt);
    const stats = await ask('stats');
    const audits = stats.audits;
    live.audits = audits.map((a) => ({ decision: a.decision, source: a.source, tool_name: a.tool_name, summary: a.summary, reason: a.reason }));
    const auditOk = audits.length >= 4
      && audits.every((a) => a.decision === 'user-input' && a.source === 'user' && a.tool_name === 'terminal' && a.reason === 'The user acted in the terminal directly; no policy applies.' && a.summary.startsWith(`terminal ${LIVE}: `) && a.summary.endsWith(`(in: ${echoCommand})`))
      && audits.some((a) => a.summary.includes('took control of the terminal'))
      && audits.some((a) => a.summary.includes(`typed ${JSON.stringify(typed)}`))
      && audits.some((a) => a.summary.includes('sent C-d'))
      && audits.some((a) => a.summary.includes('sent C-c'));
    expect('live.auditEntriesAsSpec12', auditOk, live.audits);
    // ── REQ-SHELL-166: the size the process reports equals the grid's last report ────────────────────────────────
    const lastGeometry = (await state(LIVE)).log.resize.filter((r) => r.streamId === LIVE).at(-1);
    const sizeRun = run('Write-Output "cols=$($Host.UI.RawUI.WindowSize.Width) rows=$($Host.UI.RawUI.WindowSize.Height)"');
    const sizeDone = await Promise.race([sizeRun.done, pause(15_000).then(() => null)]);
    live.resize = { reported: lastGeometry, process: sizeDone?.result.output ?? null };
    expect('live.processReportsGridSize', sizeDone !== null && lastGeometry && sizeDone.result.output.includes(`cols=${lastGeometry.cols} rows=${lastGeometry.rows}`), live.resize);
    // ── REQ-SHELL-102 / REQ-SHELL-075 (b): three surfaces over one live stream, at rest after the closing frame ──
    await pause(400);
    const rest = await state(LIVE);
    const gridLines = trimmed(rest.stream.grid.lines);
    const three = { grid: gridLines, preview: rest.stream.preview?.lines ?? null, persona: rest.stream.persona?.lines ?? null, state: [rest.stream.meta?.running, rest.stream.previewMeta?.running, rest.stream.personaMeta?.running], truncated: [rest.stream.meta?.truncated, rest.stream.previewMeta?.truncated, rest.stream.personaMeta?.truncated], exit: [rest.stream.meta?.exitCode, rest.stream.previewMeta?.exitCode, rest.stream.personaMeta?.exitCode] };
    live.threeSurfaces = { lines: gridLines.length, state: three.state, exit: three.exit };
    expect('live.threeSurfacesIdentical', JSON.stringify(three.grid) === JSON.stringify(three.preview) && JSON.stringify(three.grid) === JSON.stringify(three.persona) && gridLines.length > 0 && new Set(three.state).size === 1 && new Set(three.truncated).size === 1 && new Set(three.exit).size === 1, three);
    // ── REQ-SHELL-103/166: throughput — the same output and exit status with the window closed and open ──────────
    const flood = '1..10000 | ForEach-Object { "line $_" }; cmd /c "exit 3"';
    await ask('deliver', { on: false });
    const closedRun = run(flood);
    const closed = await Promise.race([closedRun.done, pause(60_000).then(() => null)]);
    await ask('deliver', { on: true });
    const openRun = run(flood);
    const open = await Promise.race([openRun.done, pause(60_000).then(() => null)]);
    await pause(500);
    const closedLines = (closed?.result.output ?? '').split('\n');
    const openLines = (open?.result.output ?? '').split('\n');
    const firstDiff = closedLines.findIndex((l, i) => l !== openLines[i]);
    live.throughput = { closedMs: closed?.result.elapsedMs ?? null, openMs: open?.result.elapsedMs ?? null, closedExit: closed?.result.exitCode ?? null, openExit: open?.result.exitCode ?? null, closedLines: closedLines.length, lines: openLines.length, outputEqual: closed !== null && open !== null && closed.result.output === open.result.output, ...(firstDiff >= 0 ? { firstDiff: { at: firstDiff, closed: closedLines.slice(firstDiff, firstDiff + 3), open: openLines.slice(firstDiff, firstDiff + 3) } } : {}) };
    expect('live.throughputEqualWindowClosedOrOpen', closed !== null && open !== null && closed.result.output === open.result.output && closed.result.exitCode === open.result.exitCode && open.result.exitCode === 3 && open.result.output.split('\n').length === 10000, live.throughput);
    const afterFlood = await state(LIVE);
    expect('live.floodPainted', afterFlood.stream.grid.lines.some((l) => l.includes('line 10000')) && afterFlood.stream.preview.lines.some((l) => l.includes('line 10000')), afterFlood.stream.grid.lines.slice(-3));
    const finalStats = await ask('stats');
    live.delivery = { delivered: finalStats.delivered, limiter: finalStats.limiter, counters: finalStats.counters };
    live.harnessLog = harnessLog.slice(-20);
  } catch (error) {
    failures.push(`live harness: ${error && error.stack ? error.stack : String(error)}`);
  } finally {
    ipcMain.removeHandler('proof:command');
    if (child) { try { child.stdin.write('{"id":0,"op":"quit"}\n'); } catch { /* gone */ } await pause(300); try { child.kill(); } catch { /* gone */ } }
  }

  results.consoleErrors = consoleErrors;
  results.consoleAll = consoleAll.slice(0, 40);
  if (consoleErrors.length > 0) failures.push(`console errors: ${JSON.stringify(consoleErrors)}`);
  writeFileSync(join(out, 'results.json'), `${JSON.stringify({ passed: failures.length === 0, failures, results }, null, 2)}\n`);
  app.exit(failures.length === 0 ? 0 : 1);
}).catch((error) => { console.error(error); app.exit(3); });
