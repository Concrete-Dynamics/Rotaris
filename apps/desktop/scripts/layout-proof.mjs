/**
 * The layout proof (`pnpm layout-proof`) — the Workspace view's grid, measured at the sizes the specification names.
 *
 * It exists because three defects lived in a screen everybody had looked at. Nothing asserted that the grid a
 * stylesheet DEFINES is the grid the browser BUILDS, so a `grid-area` naming an area that no template declares
 * produced implicit tracks — a dead column and a dead row — in every wide window, and no proof noticed. The
 * screenshots had been showing it for weeks.
 *
 * What it asserts, and why each one is the assertion whose absence let a defect live:
 *
 *   1. NO IMPLICIT TRACKS. The computed `grid-template-columns`/`rows` have exactly as many tracks as the
 *      computed `grid-template-areas` declares. A browser invents a track when an item names an area that does
 *      not exist, and the invention is invisible to every test that only looks at whether elements are present.
 *   2. EVERY NAMED AREA EXISTS. Each child's `grid-area` name appears in the template. This is (1)'s cause rather
 *      than its symptom, so a regression names the element rather than a track count.
 *   3. NOTHING CLIPS AT 1000×680. REQ-MONITOR-051: "The workspace must remain usable down to 1000×680." Every
 *      surface, and the primary action in particular, lies wholly inside the viewport.
 *   4. THE BREAKPOINT ENGAGES ON A LIVE RESIZE. REQ-MONITOR-051's drawer layout below 1180 px, asserted after a
 *      resize rather than at startup, because the defect was precisely that it worked at mount and never again.
 *   5. A MODAL IS THE TOPMOST ELEMENT AT ITS OWN CENTRE, and its confirmation reaches the product.
 *   6. A TASK'S UNBROKEN TOKEN STAYS INSIDE THE PLAN COLUMN. REQ-SHELL-022's "no control requires horizontal
 *      scrolling to reach": a task added through the pane, whose text is one 200-character token, measured against
 *      the sidebar's content edge and the sidebar's scroll width.
 *   7. THE STRIP'S PATH LINK IS SHORTENED FROM THE MIDDLE. REQ-WORKSPACE-149 rule 2: at 1180 px, the narrowest width at
 *      which REQ-SHELL-047 still shows it, a deep workspace path keeps its head and its folder name with one `…` between,
 *      drawn unclipped, its tooltip the full path; the branch item's label is unclipped too, after the branch icon in the
 *      accent colour (REQ-SHELL-042); widening the window
 *      re-measures it. The workspace sits at a deliberately deep path for this
 *      (`docs/defects/fixed/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md`).
 *
 * Evidence under `.proof/layout-proof/`: a PNG per size, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';
import { startApp } from './lib/driver.mjs';

const output = evidenceDirectory('.layout-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

// Deep on purpose: section 7 needs a path the status strip cannot hold whole at 1180 px (REQ-WORKSPACE-149 rule 2).
const FOLDER = 'proj-folder';
const workspace = join(output, 'a-scratch-directory-deep-enough-that-the-status-strip-must-shorten-it', '349f6b0e-6880-59f4-942d-818d53f7b76a', FOLDER);
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# layout proof\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n'));

const results = [];
let failures = 0;
const check = (name, ok, detail) => {
  results.push({ name, verdict: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

/** Everything the assertions need, read in one pass so a measurement cannot straddle two layouts. */
const MEASURE = `JSON.stringify((() => {
  const w = document.querySelector('.workspace');
  if (!w) return { missing: true };
  const s = getComputedStyle(w);
  const r = w.getBoundingClientRect();
  const areas = (s.gridTemplateAreas || '').match(/"[^"]*"/g) || [];
  const areaRows = areas.map((a) => a.slice(1, -1).trim().split(/\\s+/));
  const names = [...new Set(areaRows.flat())].filter((n) => n !== '.');
  const tracks = (v) => (v && v !== 'none' ? v.trim().split(/\\s+/) : []);
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom), right: Math.round(b.right) }; };
  const kids = [...w.children].map((el) => {
    const cs = getComputedStyle(el);
    // The shorthand reads back as "name / name / name / name" when it resolved to a named area, and as
    // "auto / auto / auto / auto" when it did not. The first token is the name the author asked for.
    const asked = (cs.gridArea || '').split('/')[0].trim();
    return { cls: (typeof el.className === 'string' ? el.className : el.tagName).trim(), area: asked, ...box(el) };
  });
  const startRun = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Start run')
    // PD-CHAT-001 revision 2 (the docked strip): the send pill carries the mode's short label visible
    // ("Run") and the spec's own wording as its accessible name, so the lookup follows the name.
    ?? [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').startsWith('Start run'));
  return {
    viewport: { w: innerWidth, h: innerHeight },
    cls: w.className,
    grid: box(w),
    cols: tracks(s.gridTemplateColumns), rows: tracks(s.gridTemplateRows),
    areaCols: areaRows.length ? areaRows[0].length : 0, areaRows: areaRows.length, names,
    drawerBar: !!document.querySelector('.workspace__drawer-bar'),
    kids,
    startRun: startRun ? box(startRun) : null,
  };
})())`;

// Section 6 needs a task plan the user can add to while the run is live: the orchestrator's first step opens a phase
// (`todo`, the scripted client's `add_phase`), and the second holds the run open long enough for the section to finish.
const started = await startApp({ root: join(output, 'app'), workspace, timeoutMs: 90_000, extra: { ROTARIS_SCRIPT: 'todo,wait:90000' } });
const d = started.driver;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const measure = async () => JSON.parse(await d.eval(MEASURE));

try {
  await d.waitFor('.app-shell', { timeoutMs: 30_000 });
  /**
   * Navigate by CLICKING the rail rather than by sending Ctrl+2 (REQ-SHELL-028: "a click checks the button and
   * switches the view"). The chord used to be sent immediately after `.app-shell` first matched, and the
   * driver's `chord` op sends the key event with no readiness wait of its own — so the keystroke could arrive
   * before the shell had bound its window keydown handler, be silently lost, and leave this proof waiting the
   * full 15 s for a view it had never actually asked for. It passed only because the first frame used to be
   * cheap enough that the handler was bound within the ~10 ms the driver took to get there; widening the window
   * to REQ-SHELL-022's 1440×900 made the first paint dearer and the race visible. `click` waits for its target,
   * so the navigation this proof depends on is now an assertion instead of a hope.
   */
  await d.click('.nav-item', { text: 'Workspace', timeoutMs: 15_000 });
  await d.waitFor('.workspace', { timeoutMs: 15_000 });

  /** The two structural assertions, at whatever size is current. */
  const structure = async (label, m) => {
    const implicitCols = m.cols.length - m.areaCols;
    const implicitRows = m.rows.length - m.areaRows;
    check(`${label}: the grid has no implicit tracks`,
      implicitCols <= 0 && implicitRows <= 0,
      `${m.cols.length} column tracks against ${m.areaCols} declared, ${m.rows.length} row tracks against ${m.areaRows} declared${implicitCols > 0 || implicitRows > 0 ? ` — ${implicitCols} invented column(s), ${implicitRows} invented row(s): ${m.cols.join(' ')} / ${m.rows.join(' ')}` : ''}`);
    const orphans = m.kids.filter((k) => k.area && k.area !== 'auto' && !m.names.includes(k.area));
    check(`${label}: every child's grid-area names a declared area`,
      orphans.length === 0,
      orphans.length === 0 ? `${m.kids.length} children, areas declared: ${m.names.join(', ')}` : `orphaned: ${orphans.map((o) => `.${o.cls.split(' ')[0]} wants "${o.area}"`).join('; ')}`);
  };

  /** Nothing may leave the window, and the primary action least of all. */
  const containment = async (label, m) => {
    const escapees = m.kids.filter((k) => k.bottom > m.viewport.h + 1 || k.right > m.viewport.w + 1);
    check(`${label}: no surface leaves the window`,
      escapees.length === 0,
      escapees.length === 0 ? `${m.kids.length} children all inside ${m.viewport.w}×${m.viewport.h}` : escapees.map((e) => `.${e.cls.split(' ')[0]} bottom ${e.bottom}/right ${e.right}`).join('; '));
    check(`${label}: the run control is wholly on screen`,
      m.startRun !== null && m.startRun.bottom <= m.viewport.h && m.startRun.right <= m.viewport.w && m.startRun.y >= 0,
      m.startRun === null ? 'no "Start run" control was found at all' : `[${m.startRun.x},${m.startRun.y} ${m.startRun.w}×${m.startRun.h}] in ${m.viewport.w}×${m.viewport.h}`);
  };

  // ── 1. A wide window: the layout the stylesheet means, with the agents column beside the transcript.
  await d.resize(1400, 900);
  await sleep(600);
  const wide = await measure();
  await d.screenshot(join(output, 'wide-1400x900.png'));
  await structure('1400×900', wide);
  await containment('1400×900', wide);
  check('1400×900: the agents column stands beside the transcript',
    wide.kids.some((k) => k.cls.startsWith('agents') && k.h > wide.grid.h * 0.8),
    (() => { const a = wide.kids.find((k) => k.cls.startsWith('agents')); return a ? `.agents is ${a.w}×${a.h} in a grid ${wide.grid.w}×${wide.grid.h}` : '.agents is absent'; })());

  // ── 2. REQ-MONITOR-051's floor. Below 1180 the drawer layout is what the requirement asks for.
  await d.resize(1000, 680);
  await sleep(700);
  const min = await measure();
  await d.screenshot(join(output, 'minimum-1000x680.png'));
  check('1000×680: the narrow layout engages after a live resize (REQ-MONITOR-051)',
    min.cls.includes('workspace--narrow'),
    `class "${min.cls}", drawer bar ${min.drawerBar ? 'present' : 'absent'}`);
  await structure('1000×680', min);
  await containment('1000×680', min);
  const rowSum = min.rows.reduce((a, t) => a + parseFloat(t), 0);
  check('1000×680: the rows fit the grid box',
    rowSum <= min.grid.h + 1,
    `rows sum to ${Math.round(rowSum)} in a box ${min.grid.h} tall`);

  // ── 3. Maximized: the size a person actually uses, and where the dead bands were first seen.
  const maxed = await d.send('maximize');
  await sleep(700);
  const big = await measure();
  await d.screenshot(join(output, 'maximized.png'));
  await structure(`maximized ${big.viewport.w}×${big.viewport.h}`, big);
  await containment(`maximized ${big.viewport.w}×${big.viewport.h}`, big);
  const claimed = big.cols.reduce((a, t) => a + parseFloat(t), 0);
  check(`maximized: every column track is claimed by the layout`,
    big.cols.length === big.areaCols && Math.abs(claimed - big.grid.w) < 2,
    `${big.cols.length} tracks (${big.cols.join(' ')}) summing to ${Math.round(claimed)} across a ${big.grid.w}px grid; maximized=${maxed.maximized}`);

  // ── 4. Back up, to prove the breakpoint is not a one-way trip.
  await d.resize(1400, 900);
  await sleep(700);
  const back = await measure();
  check('1400×900 again: the wide layout returns',
    !back.cls.includes('workspace--narrow') && back.cols.length === back.areaCols,
    `class "${back.cls}", ${back.cols.length} tracks against ${back.areaCols} declared`);

  /**
   * ── 5. A modal must be the TOPMOST element at its own centre.
   *
   * The eighty-fifth defect: the confirm dialog was painted under the composer, because the design system's
   * backdrop carries no `z-index` and it is rendered from an earlier grid item than the composer. It was
   * visible and focusable, and a click at the confirm button's own centre reached the composer's textarea
   * instead. Presence assertions cannot see that; only hit-testing can, so this asks the document what is
   * actually at the point a user would press, and then presses it and checks the product answered.
   */
  await d.chord('Ctrl+L');
  await d.type('a prompt for the layout proof', { enter: true });
  await d.waitFor('.transcript article.row', { timeoutMs: 30_000 });
  await sleep(1_200);
  await d.click('[data-testid="transcript-clear"]', { timeoutMs: 15_000 });
  await d.waitFor('[data-testid="clear-transcript-dialog"]', { timeoutMs: 10_000 });
  await sleep(400);
  const modal = JSON.parse(await d.eval(`JSON.stringify((() => {
    const dialog = document.querySelector('[data-testid="clear-transcript-dialog"]');
    const button = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Clear transcript');
    const r = button.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    return { cx, cy, topmost: hit === button || button.contains(hit),
      at: hit ? hit.tagName.toLowerCase() + '.' + (typeof hit.className === 'string' ? hit.className.split(' ')[0] : '') : null };
  })())`));
  await d.screenshot(join(output, 'modal.png'));
  check('a modal is the topmost element at its own centre',
    modal.topmost, `the element at (${modal.cx},${modal.cy}) is ${modal.topmost ? 'the confirm button' : `"${modal.at}"`}`);
  await d.click('[data-testid="clear-transcript-dialog"] button', { text: 'Clear transcript', timeoutMs: 10_000 });
  await sleep(1_500);
  const cleared = JSON.parse(await d.eval(`JSON.stringify({
    rows: document.querySelectorAll('.transcript article.row').length,
    user: [...document.querySelectorAll('.transcript article.row')].filter((r) => /\\brow--user\\b/.test(r.className)).length,
    dialog: !!document.querySelector('[data-testid="clear-transcript-dialog"]'),
    toast: document.body.innerText.includes('Transcript cleared.'),
  })`));
  /**
   * What "reached the product" means here is the USER ROW being gone, not an empty transcript.
   *
   * The first execution of this check asserted `rows === 0` and failed with two rows present — my assertion's
   * defect, not the product's. The clear is confirmed while the scripted run is still live, and REQ-CHAT-084's
   * behaviour is that the run's next writes land on the emptied record: `chat-controls-proof` asserts exactly
   * that a few seconds later ("new rows, no resurrected user row"). An empty transcript is therefore a claim
   * about timing; the user row's absence, the closed dialog and the toast are claims about the command.
   */
  check('the modal’s confirmation reaches the product',
    cleared.user === 0 && !cleared.dialog && cleared.toast,
    `the user row is ${cleared.user === 0 ? 'gone' : 'still there'}, the dialog is ${cleared.dialog ? 'still open' : 'closed'}, the toast ${cleared.toast ? 'was shown' : 'was not shown'} (${cleared.rows} rows now, which a live run may legitimately have rewritten)`);

  /**
   * ── 6. A task's text with no break opportunity stays inside the plan column (REQ-SHELL-022).
   *
   * REQ-SHELL-022: "no control requires horizontal scrolling to reach", and a task's text is a control (it renames the
   * task). Ordinary words wrap; a token with none (a path, a hash, the live run's `printf "LINE-%03d xxxx…"`) ran past
   * the sidebar's edge and gave `.agents` a horizontal scrollbar
   * (`docs/defects/fixed/a-long-unbroken-token-in-a-task-pushes-the-task-plan-into-horizontal-scroll.md`). The task is
   * added through the pane's own "+ Add task" control, at the wide size the live run saw it.
   */
  const TOKEN = `LONG-${'x'.repeat(195)}`;
  await d.click('.todo-phase__add', { timeoutMs: 30_000 });
  await d.waitFor('input[aria-label="New task name"]', { timeoutMs: 10_000 });
  await d.type(TOKEN, { enter: true });
  await d.waitFor('.todo-task__text', { timeoutMs: 10_000 });
  await sleep(600);
  const plan = JSON.parse(await d.eval(`JSON.stringify((() => {
    const agents = document.querySelector('.agents');
    const text = [...document.querySelectorAll('.todo-task__text')].find((b) => (b.textContent || '').includes(${JSON.stringify(TOKEN)}));
    if (!agents || !text) return { missing: !agents ? '.agents' : 'the task' };
    const a = agents.getBoundingClientRect();
    const t = text.getBoundingClientRect();
    const cs = getComputedStyle(agents);
    const inner = a.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    return {
      agents: { left: Math.round(a.left), right: Math.round(a.right), contentRight: Math.round(inner), scrollWidth: agents.scrollWidth, clientWidth: agents.clientWidth },
      text: { left: Math.round(t.left), right: Math.round(t.right), w: Math.round(t.width), h: Math.round(t.height), scrollWidth: text.scrollWidth, clientWidth: text.clientWidth },
    };
  })())`));
  await d.screenshot(join(output, 'task-plan-long-token.png'));
  check('a task whose text is one 200-character token stays inside the plan column (REQ-SHELL-022)',
    !plan.missing && plan.text.right <= plan.agents.contentRight + 1 && plan.text.scrollWidth <= plan.text.clientWidth + 1,
    plan.missing ? `${plan.missing} was not found` : `text box [${plan.text.left}..${plan.text.right}] ${plan.text.w}×${plan.text.h}, its content ${plan.text.scrollWidth} in ${plan.text.clientWidth}; the column's content edge at ${plan.agents.contentRight}`);
  check('the sidebar needs no horizontal scroll to show it (REQ-SHELL-022)',
    !plan.missing && plan.agents.scrollWidth <= plan.agents.clientWidth,
    plan.missing ? `${plan.missing} was not found` : `.agents scrollWidth ${plan.agents.scrollWidth} against clientWidth ${plan.agents.clientWidth}`);

  /**
   * ── 7. The strip's path link and branch item under REQ-WORKSPACE-149 rule 2, at 1180 px and again at 1400 px.
   *
   * Before the repair the link was cut at its END by `text-overflow: ellipsis` and kept the path's head alone; the note's
   * drive at 1180 px showed `/tmp/claude-0/-home-user-…` with the folder name gone.
   */
  const STRIP = `JSON.stringify((() => {
    const strip = document.querySelector('.status-strip');
    const read = (id) => {
      const item = document.querySelector('[data-testid="' + id + '"]');
      if (!item) return null;
      const label = item.querySelector('.status-strip__label');
      const b = item.getBoundingClientRect();
      return { title: item.getAttribute('title'), text: (item.textContent || '').trim(), label: label ? label.textContent : null,
        labelScroll: label ? label.scrollWidth : 0, labelClient: label ? label.clientWidth : 0, overflow: getComputedStyle(item).textOverflow,
        left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) };
    };
    // REQ-SHELL-042: the branch icon's computed colour against the accent token's, resolved on a probe element.
    const icon = document.querySelector('[data-testid="strip-branch"] .status-strip__icon');
    const probe = document.createElement('span');
    probe.style.color = 'var(--rt-accent)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return { viewport: innerWidth, stripScroll: strip ? strip.scrollWidth : 0, stripClient: strip ? strip.clientWidth : 0,
      path: read('strip-workspace'), branch: read('strip-branch'),
      icon: icon ? { cls: icon.className, color: getComputedStyle(icon).color, accent, before: icon.nextElementSibling ? icon.nextElementSibling.className : null } : null };
  })())`;
  await d.resize(1180, 800);
  await sleep(800);
  const narrow = JSON.parse(await d.eval(STRIP));
  await d.screenshot(join(output, 'strip-1180.png'));
  const head = workspace.slice(0, 5);
  const p7 = narrow.path;
  check('1180 px: the strip still shows the workspace path link (REQ-SHELL-047)', p7 !== null, `viewport ${narrow.viewport} px; link ${p7 ? 'present' : 'absent'}`);
  check('1180 px: the path link is shortened from the MIDDLE, keeping its head and its folder name with exactly one … (REQ-WORKSPACE-149 rule 2)',
    p7 !== null && p7.label !== null && [...p7.label].filter((c) => c === '…').length === 1 && p7.label.startsWith(head) && p7.label.endsWith(FOLDER),
    p7 === null ? 'no link' : `label "${p7.label}" (${p7.label?.length ?? 0} of ${workspace.length} characters), box ${p7.w} px`);
  check('1180 px: the shortened label is drawn whole — not clipped, no end ellipsis — and its tooltip carries the full path (REQ-WORKSPACE-149 rule 2, REQ-SHELL-022)',
    p7 !== null && p7.labelScroll <= p7.labelClient + 1 && p7.overflow === 'clip' && p7.title === `Workspace folder: ${workspace}. Opens it in your file manager.`,
    p7 === null ? 'no link' : `label content ${p7.labelScroll} in ${p7.labelClient} px; text-overflow ${p7.overflow}; title ${JSON.stringify(p7.title)}`);
  const b7 = narrow.branch;
  check('1180 px: the branch item\'s label is drawn whole, shortened from the middle if at all, beside the path and not over it',
    b7 !== null && (b7.label === null || b7.labelScroll <= b7.labelClient + 1) && (p7 === null || p7.right <= b7.left + 1),
    b7 === null ? 'no branch item' : `branch "${b7.text}" (label "${b7.label}", content ${b7.labelScroll} in ${b7.labelClient} px) at [${b7.left}..${b7.right}]; path ends at ${p7?.right}`);
  check('1180 px: the branch item draws the branch icon before the branch name, in the accent colour (REQ-SHELL-042, REQ-WORKSPACE-020)',
    narrow.icon !== null && /\bph-git-branch\b/.test(narrow.icon.cls) && narrow.icon.color === narrow.icon.accent && narrow.icon.before === 'status-strip__label',
    narrow.icon === null ? 'no icon in the branch item' : `icon "${narrow.icon.cls}" coloured ${narrow.icon.color} against --rt-accent ${narrow.icon.accent}, followed by ${narrow.icon.before}`);
  check('1180 px: the strip itself does not overflow', narrow.stripScroll <= narrow.stripClient + 1, `scrollWidth ${narrow.stripScroll} against clientWidth ${narrow.stripClient}`);
  await d.resize(1400, 900);
  await sleep(800);
  const widened = JSON.parse(await d.eval(STRIP));
  check('1400 px: the label is recomputed when the width changes — longer than at 1180 px (REQ-WORKSPACE-149 rule 2)',
    widened.path !== null && p7 !== null && (widened.path.label ?? '').length > (p7.label ?? '').length && (widened.path.label ?? '').endsWith(FOLDER),
    `label at 1400 px "${widened.path?.label}" (box ${widened.path?.w} px) against "${p7?.label}" (box ${p7?.w} px) at 1180 px`);
} finally {
  await d.quit().catch(() => undefined);
  d.close();
  try { if (started.child.pid) process.kill(started.child.pid); } catch { /* already gone after quit */ }
  const log = existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '';
  writeFileSync(join(output, 'app.log'), log);
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

console.log(`\n${results.filter((r) => r.verdict === 'PASS').length} passed, ${failures} failed — evidence in ${output}`);
process.exit(failures === 0 ? 0 : 1);
