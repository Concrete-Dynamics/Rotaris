/**
 * `pnpm ui-audit` — sweep every primary view at every size and REPORT what the browser actually built.
 *
 * This is the generalisation of the four measurements that found defects 82 to 85 in one screen. Those were
 * found by measuring one grid by hand; there are seven primary views, a dozen overlays and three sizes that
 * matter, and hand-measuring that product is how a defect survives in a screen everybody has looked at.
 *
 * It REPORTS; it does not assert. `pnpm layout-proof` is where a finding becomes a standing assertion — the
 * two are deliberately separate, because an audit that fails a build teaches people to silence it.
 *
 * Four sweeps, each the general form of a known defect:
 *
 *   TRACKS      every grid container in the document, not just `.workspace`: a `grid-area` naming an area no
 *               template declares makes the browser invent tracks (defect 82).
 *   CONTAINMENT every element whose box leaves the viewport, with the offender's own class (defect 82's symptom
 *               at 1000×680, REQ-MONITOR-051's floor).
 *   STACKING    every visible, enabled control hit-tested at its own centre. A control that is not the topmost
 *               element there is visible, focusable and unclickable (defect 85). This is the sweep no presence
 *               assertion can replace.
 *   TRAPPED     every `position: fixed` element whose ancestor carries `transform`, `filter`, `will-change` or
 *               `contain` — which silently makes that ancestor the containing block, so the element is
 *               positioned against a box it was never measured for and its `z-index` cannot escape.
 *
 *   node apps/desktop/scripts/ui-audit.mjs [--skip-build] [--sizes=1400x900,1000x680] [--views=1,2,3]
 *
 * Evidence under `.ui-audit/`: a PNG per view per size, and `report.json`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { buildDesktop, evidenceDirectory, repo } from './lib/harness.mjs';
import { startApp } from './lib/driver.mjs';
import { evaluateContracts } from './lib/layout-relations.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const found = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (found === undefined) return fallback;
  return found.includes('=') ? found.slice(found.indexOf('=') + 1) : true;
};

const outputFlag = flag('output', null);
const output = outputFlag === null ? evidenceDirectory('.ui-audit') : resolve(repo, String(outputFlag));
const outputWithinRepo = relative(repo, output);
if (outputWithinRepo === '' || outputWithinRepo === '..' || outputWithinRepo.startsWith(`..${sep}`)) throw new Error(`ui-audit output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!argv.includes('--skip-build')) buildDesktop(output);

const workspace = join(output, 'workspace');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# ui audit\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n'));

/** REQ-SHELL-023's seven, in the specification's order, with the root each one renders. */
const VIEWS = [
  { n: 1, name: 'Overview', root: '.overview' },
  { n: 2, name: 'Workspace', root: '.workspace' },
  { n: 3, name: 'Mission', root: '.mission' },
  { n: 4, name: 'Requirements', root: '.req' },
  { n: 5, name: 'Git', root: '.git' },
  { n: 6, name: 'Library', root: '.library' },
  { n: 7, name: 'Settings', root: '.settings' },
];

const SIZES = String(flag('sizes', '1400x900,1000x680')).split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { w, h, label: s };
});
const wanted = flag('views', null);
const views = wanted === null ? VIEWS : VIEWS.filter((v) => String(wanted).split(',').includes(String(v.n)));
/** REQ-SHELL-128's three; absent, the audit reads whatever the preference store already holds. */
const THEMES = ['rotaris-dim', 'nocturne', 'high-contrast'];
const theme = flag('theme', null);
if (theme !== null && !THEMES.includes(String(theme))) throw new Error(`unknown theme ${theme}; REQ-SHELL-128 names ${THEMES.join(', ')}`);

/**
 * The whole audit, as one expression evaluated in the renderer.
 *
 * One pass so a measurement cannot straddle two layouts, and `JSON.stringify` because the seam carries JSON —
 * an element reference would not survive the wire.
 */
const AUDIT = `JSON.stringify((() => {
  const cls = (el) => (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase());
  const all = [...document.querySelectorAll('body *')];
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // ── TRACKS: every grid container, not just the one a person thought to look at.
  const tracks = [];
  for (const el of all) {
    const s = getComputedStyle(el);
    if (s.display !== 'grid' && s.display !== 'inline-grid') continue;
    const quoted = (s.gridTemplateAreas || '').match(/"[^"]*"/g);
    if (!quoted) continue;                       // no named areas: nothing to orphan
    const rows = quoted.map((a) => a.slice(1, -1).trim().split(/\\s+/));
    const names = [...new Set(rows.flat())].filter((n) => n !== '.');
    const list = (v) => (v && v !== 'none' ? v.trim().split(/\\s+/) : []);
    const cols = list(s.gridTemplateColumns), rowTracks = list(s.gridTemplateRows);
    const orphans = [...el.children]
      .filter((k) => {
        const ks = getComputedStyle(k);
        if (ks.position === 'absolute' || ks.position === 'fixed') return false;  // abspos items create no implicit track
        const asked = (ks.gridArea || '').split('/')[0].trim();
        return asked && asked !== 'auto' && !names.includes(asked);
      })
      .map((k) => ({ child: cls(k), wants: getComputedStyle(k).gridArea.split('/')[0].trim() }));
    const implicitCols = cols.length - (rows[0] ? rows[0].length : 0);
    const implicitRows = rowTracks.length - rows.length;
    if (implicitCols > 0 || implicitRows > 0 || orphans.length > 0) {
      tracks.push({ grid: cls(el), declared: { cols: rows[0] ? rows[0].length : 0, rows: rows.length },
                    computed: { cols: cols.length, rows: rowTracks.length }, implicitCols, implicitRows, names, orphans });
    }
  }

  // ── CONTAINMENT: what leaves the window. Scroll containers legitimately hold overflowing children, so an
  //    element is only reported when no ancestor between it and the root scrolls in that axis.
  const scrolls = (el, axis) => {
    const s = getComputedStyle(el);
    const v = axis === 'y' ? s.overflowY : s.overflowX;
    return v === 'auto' || v === 'scroll';
  };
  const escapedBy = (el, axis) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (scrolls(p, axis)) return false;
    return true;
  };
  const escapees = [];
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const belowFold = r.bottom > innerHeight + 1 && r.top < innerHeight;   // straddling the edge, not scrolled away
    const pastRight = r.right > innerWidth + 1 && r.left < innerWidth;
    if ((belowFold && escapedBy(el, 'y')) || (pastRight && escapedBy(el, 'x'))) {
      escapees.push({ el: cls(el), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right),
                      axis: belowFold ? 'y' : 'x' });
    }
  }

  // ── STACKING: is each control the topmost thing at its own centre?
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="menuitem"], [role="option"], [role="tab"], [tabindex]:not([tabindex="-1"])')];
  const buried = [];
  /**
   * Three ways a control is legitimately not the topmost thing at its own centre. Each was a false finding in
   * this tool's first execution (2026-09-12, 18 reported, 6 real), and each is kept counted rather than
   * silently dropped, so the sweep's own blind spots are readable beside its findings.
   */
  const skipped = { hidden: 0, closedDetails: 0, clipped: 0, offscreen: 0 };
  /**
   * Is the point clipped away by ANY ancestor that clips, not merely by the nearest one?
   *
   * The nearest alone was this guard's first form and it was wrong: a control can sit inside the composer's
   * own box while that whole box is scrolled below the view that clips it, so the test passed and the hit
   * landed on the status strip showing through. Every clipping ancestor has to contain the point.
   */
  const establishesCB = (s) => s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none'
    || (s.willChange || '').split(',').map((w) => w.trim()).some((w) => w === 'transform' || w === 'filter' || w === 'perspective')
    || (s.contain || '').split(/\\s+/).some((c) => c === 'paint' || c === 'layout' || c === 'strict' || c === 'content');
  const clippedAway = (el, cx, cy) => {
    // Only ancestors in the element's CONTAINING-BLOCK chain can clip it. A fixed element is clipped by the
    // viewport alone unless an ancestor establishes a containing block; an absolute one only by positioned
    // ancestors. Without this the guard excluded all 30 rows of the fixed slash popup and reported the
    // surface CLEAN without having tested anything — a guard that skips everything proves nothing.
    let anchored = getComputedStyle(el).position;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      const skip = (anchored === 'fixed' && !establishesCB(s))
        || (anchored === 'absolute' && s.position === 'static' && !establishesCB(s));
      if (!skip) {
        const clips = (v) => v === 'auto' || v === 'scroll' || v === 'hidden';
        if (clips(s.overflowY) || clips(s.overflowX)) {
          const cr = p.getBoundingClientRect();
          if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) return true;
        }
      }
      // The anchor is carried UP the walk, not read once off the element. A row of the slash popup is static,
      // but the popup between it and the shell is fixed, so nothing above the popup clips that row. Reading
      // the row's own position alone made the composer overlay clip all thirty rows and the surface report
      // clean with nothing tested.
      if (s.position === 'fixed') anchored = 'fixed';
      else if (s.position === 'absolute' && anchored !== 'fixed') anchored = 'absolute';
    }
    return false;
  };
  for (const el of controls) {
    if (!visible(el) || el.disabled) { skipped.hidden += 1; continue; }
    if (el.closest('[aria-hidden="true"]') || el.closest('[inert]')) { skipped.hidden += 1; continue; }
    // A CLOSED <details> keeps a real layout box for content it never paints, so every control inside one
    // reads as buried. The user cannot see it either: not a finding.
    const details = el.closest('details');
    if (details !== null && !details.open && el.closest('summary') === null) { skipped.closedDetails += 1; continue; }
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { skipped.offscreen += 1; continue; }
    // getBoundingClientRect reports an UNCLIPPED position, so a control scrolled past its container's edge
    // has a centre over whatever shows through the clip: the status strip, a neighbouring cell, the view.
    // (No backticks in this string: the whole audit is one template literal, and one would end it.)
    if (clippedAway(el, cx, cy)) { skipped.clipped += 1; continue; }
    const hit = document.elementFromPoint(cx, cy);
    if (hit === null) { buried.push({ el: cls(el), at: '(nothing)', cx, cy, text: (el.textContent || '').trim().slice(0, 40) }); continue; }
    if (hit === el || el.contains(hit) || hit.contains(el)) continue;
    buried.push({ el: cls(el), at: cls(hit), cx, cy, text: (el.textContent || '').trim().slice(0, 40) });
  }

  // ── TRAPPED: a fixed element whose containing block is not the viewport.
  const trapped = [];
  for (const el of all) {
    if (getComputedStyle(el).position !== 'fixed') continue;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ps = getComputedStyle(p);
      const why = ps.transform !== 'none' ? 'transform'
        : ps.filter !== 'none' ? 'filter'
        : ps.perspective !== 'none' ? 'perspective'
        : (ps.willChange || '').split(',').map((w) => w.trim()).some((w) => w === 'transform' || w === 'filter' || w === 'perspective') ? 'will-change'
        : (ps.contain || '').split(/\\s+/).some((c) => c === 'paint' || c === 'layout' || c === 'strict' || c === 'content') ? 'contain'
        : null;
      if (why !== null) { trapped.push({ fixed: cls(el), ancestor: cls(p), why, visible: visible(el) }); break; }
    }
  }

  // ── CONTRACTS: explicit relationships published by shared components.
  // This block MEASURES only; lib/layout-relations.mjs decides, outside the page, where a
  // unit test can reach every branch with fixed numbers.
  const box = (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  const measured = [];
  for (const el of document.querySelectorAll('[data-ui-contract]')) {
    const id = el.dataset.ui || cls(el);
    let relations;
    try { relations = JSON.parse(el.dataset.uiContract || '[]'); }
    catch { measured.push({ id, unreadable: true, relations: [] }); continue; }
    const own = box(el.getBoundingClientRect());
    const rows = [];
    for (const relation of relations) {
      const target = relation.target ? document.querySelector('[data-ui="' + CSS.escape(relation.target) + '"]') : null;
      const measurement = { own, target: target ? box(target.getBoundingClientRect()) : null,
        viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight, left: 0, top: 0, right: innerWidth, bottom: innerHeight },
        scroll: { scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight } };
      if (relation.kind === 'spacing-token') {
        measurement.computed = {
          property: parseFloat(getComputedStyle(el).getPropertyValue(relation.property)),
          token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue(relation.token)),
        };
      }
      if (relation.kind === 'hit-test') {
        const x = Math.round(own.x + own.width / 2), y = Math.round(own.y + own.height / 2);
        const hit = document.elementFromPoint(x, y);
        measurement.hit = { x, y, element: hit ? cls(hit) : null, self: hit === el,
          descendant: hit !== null && hit !== el && el.contains(hit),
          ancestor: hit !== null && hit !== el && hit.contains(el) };
      }
      rows.push({ relation, measurement });
    }
    measured.push({ id, unreadable: false, relations: rows });
  }

  const geometry = [...document.querySelectorAll('[data-ui], [data-ui-component]')].filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.ui || null, component: el.dataset.uiComponent || null, element: cls(el),
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100,
      scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight };
  });
  const styles = [...document.querySelectorAll('[data-ui], [data-ui-component]')].filter(visible).map((el) => {
    const s = getComputedStyle(el);
    return { id: el.dataset.ui || null, component: el.dataset.uiComponent || null, element: cls(el),
      display: s.display, position: s.position, fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
      color: s.color, backgroundColor: s.backgroundColor, borderRadius: s.borderRadius,
      gap: s.gap, rowGap: s.rowGap, columnGap: s.columnGap,
      padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' '),
      margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].join(' ') };
  });

  return { viewport: { w: innerWidth, h: innerHeight },
           counts: { elements: all.length, controls: controls.length, skipped },
           tracks, escapees, buried, trapped, measured, geometry, styles };
})())`;

/**
 * The overlay audit, scoped to one open surface.
 *
 * A whole-document sweep is the wrong instrument here: while a modal is open, every control BEHIND it is
 * legitimately unreachable, and reporting those would bury the one finding that matters. So this asks a
 * narrower question — of the controls the user can see IN this overlay, is each one the topmost element at
 * its own centre, and does the overlay itself sit inside the window? That is defect 85 exactly: a dialog
 * that was visible, focusable and painted under the composer.
 */
const OVERLAY_AUDIT = (root) => `JSON.stringify((() => {
  const cls = (el) => (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase());
  const host = document.querySelector(${JSON.stringify(root)});
  if (!host) return { missing: true };
  const r = host.getBoundingClientRect();
  const controls = [...host.querySelectorAll('button, a[href], input, select, textarea, [role="menuitem"], [role="option"], [role="tab"]')];
  const buried = [];
  let clipped = 0;
  // An overlay's own list scrolls — the palette's and the slash popup's both do — so a row below the fold of
  // that list is CLIPPED, not buried, exactly as in the whole-document sweep.
  const establishesCB = (s) => s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none'
    || (s.willChange || '').split(',').map((w) => w.trim()).some((w) => w === 'transform' || w === 'filter' || w === 'perspective')
    || (s.contain || '').split(/\\s+/).some((c) => c === 'paint' || c === 'layout' || c === 'strict' || c === 'content');
  const clippedAway = (el, cx, cy) => {
    // Only ancestors in the element's CONTAINING-BLOCK chain can clip it. A fixed element is clipped by the
    // viewport alone unless an ancestor establishes a containing block; an absolute one only by positioned
    // ancestors. Without this the guard excluded all 30 rows of the fixed slash popup and reported the
    // surface CLEAN without having tested anything — a guard that skips everything proves nothing.
    let anchored = getComputedStyle(el).position;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      const skip = (anchored === 'fixed' && !establishesCB(s))
        || (anchored === 'absolute' && s.position === 'static' && !establishesCB(s));
      if (!skip) {
        const clips = (v) => v === 'auto' || v === 'scroll' || v === 'hidden';
        if (clips(s.overflowY) || clips(s.overflowX)) {
          const cr = p.getBoundingClientRect();
          if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) return true;
        }
      }
      // The anchor is carried UP the walk, not read once off the element. A row of the slash popup is static,
      // but the popup between it and the shell is fixed, so nothing above the popup clips that row. Reading
      // the row's own position alone made the composer overlay clip all thirty rows and the surface report
      // clean with nothing tested.
      if (s.position === 'fixed') anchored = 'fixed';
      else if (s.position === 'absolute' && anchored !== 'fixed') anchored = 'absolute';
    }
    return false;
  };
  for (const el of controls) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.disabled) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const details = el.closest('details');
    if (details !== null && !details.open && el.closest('summary') === null) continue;
    const cx = Math.round(b.x + b.width / 2), cy = Math.round(b.y + b.height / 2);
    if (clippedAway(el, cx, cy)) { clipped += 1; continue; }
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { buried.push({ el: cls(el), at: '(off screen)', cx, cy, text: (el.textContent || '').trim().slice(0, 40) }); continue; }
    const hit = document.elementFromPoint(cx, cy);
    if (hit === el || (hit && (el.contains(hit) || hit.contains(el)))) continue;
    buried.push({ el: cls(el), at: hit ? cls(hit) : '(nothing)', cx, cy, text: (el.textContent || '').trim().slice(0, 40) });
  }
  // What is on top at the overlay's own centre, and is the overlay inside the window?
  const mx = Math.round(r.x + r.width / 2), my = Math.round(r.y + r.height / 2);
  const atCentre = document.elementFromPoint(mx, my);
  return {
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: innerWidth, h: innerHeight },
    outside: r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1,
    topmostAtCentre: atCentre !== null && (atCentre === host || host.contains(atCentre)),
    coveredBy: atCentre === null ? '(nothing)' : cls(atCentre),
    // The tested count is reported because a guard that excludes everything would otherwise report a clean
    // surface without having asked one question of it. A sweep with nothing tested is a finding about the
    // sweep. (No backticks anywhere in this string: it is one template literal and one would end it.)
    controls: controls.length, clipped, tested: controls.length - clipped, buried,
  };
})())`;

/** Every overlay the driver can reach, and how. The slash commands are the proofs' own openers. */
const OVERLAYS = [
  { name: 'command palette', root: '[data-testid="command-palette"]', chord: 'Ctrl+K' },
  { name: 'slash popup', root: '[data-testid="slash-popup"]', typed: '/', enter: false },
  // `/pop` is unavailable with nothing stashed ("No stashed prompts. Use Stash beside the composer first."),
  // so the stash is made through the composer's own control rather than through a second slash command: a
  // slash command typed and submitted in one burst arrives before the popup has filtered, and the composer
  // keeps the literal text. An opener that cannot open is a finding about the audit, not about the product.
  { name: 'stash dialog', root: '[data-testid="stash-dialog"]', typed: '/pop', enter: true,
    prelude: [{ text: 'a prompt for the ui audit', enter: false }, { click: '[data-testid="transcript-stash"]' }] },
  { name: 'session browser', root: '.session-browser', typed: '/sessions', enter: true },
  { name: 'start-session dialog', root: '[data-testid="start-session-dialog"]', typed: '/new', enter: true },
  { name: 'worktree dialog', root: '[data-testid="worktree-dialog"]', typed: '/worktree', enter: true },
];

const findings = [];
const geometryEvidence = [];
const styleEvidence = [];
const note = (kind, view, size, detail) => {
  findings.push({ kind, view, size, ...detail });
  console.log(`  ${kind.padEnd(11)} ${view} @ ${size} — ${JSON.stringify(detail)}`);
};

const started = await startApp({ root: join(output, 'app'), workspace, timeoutMs: 90_000 });
const d = started.driver;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await d.waitFor('.app-shell', { timeoutMs: 30_000 });
  // One named theme for the whole pack, so an evidence directory answers for exactly one palette
  // (REQ-SHELL-128's three). The theme matrix itself is `pnpm theme-proof`'s; this is the review's
  // choice of ground, recorded in the manifest rather than inferred from a screenshot.
  if (theme !== null) {
    await d.command({ kind: 'theme.set', name: String(theme) });
    const applied = await d.eval('document.documentElement.dataset.theme');
    if (applied !== theme) throw new Error(`ui-audit asked for theme ${theme} and the document reports ${JSON.stringify(applied)}`);
    await sleep(300);
  }

  for (const size of SIZES) {
    await d.resize(size.w, size.h);
    await sleep(700);
    for (const view of views) {
      await d.chord(`Ctrl+${view.n}`);
      // The root is what says the view arrived; a fixed wait would be the timing guess the driver exists to end.
      const reached = await d.waitFor(view.root, { timeoutMs: 15_000 }).then(() => true).catch(() => false);
      if (!reached) { note('UNREACHED', view.name, size.label, { root: view.root }); continue; }
      await sleep(450);
      const a = JSON.parse(await d.eval(AUDIT));
      await d.screenshot(join(output, `${view.n}-${view.name.toLowerCase()}-${size.label}.png`));
      geometryEvidence.push({ view: view.name, size: size.label, viewport: a.viewport, items: a.geometry });
      styleEvidence.push({ view: view.name, size: size.label, items: a.styles });
      for (const t of a.tracks) note('TRACKS', view.name, size.label, t);
      for (const e of a.escapees) note('CONTAINMENT', view.name, size.label, e);
      for (const b of a.buried) note('STACKING', view.name, size.label, b);
      for (const t of a.trapped) note('TRAPPED', view.name, size.label, t);
      const contracts = evaluateContracts(a.measured);
      for (const contract of contracts.filter((candidate) => !candidate.pass)) note('CONTRACT', view.name, size.label, contract);
      console.log(`${a.tracks.length + a.escapees.length + a.buried.length + a.trapped.length + contracts.filter((candidate) => !candidate.pass).length === 0 ? 'CLEAN' : 'FOUND'}  ${view.name} @ ${size.label} (${a.counts.elements} elements, ${a.counts.controls} controls, ${contracts.length} contracts, skipped ${JSON.stringify(a.counts.skipped)})`);
    }
  }
  // ── The overlays, at both sizes. Nothing was open during the sweep above, and every overlay is a surface
  //    that paints over another — the one place a stacking defect can hide from a presence assertion.
  if (!argv.includes('--no-overlays')) {
    for (const size of SIZES) {
      await d.resize(size.w, size.h);
      await sleep(600);
      for (const overlay of OVERLAYS) {
        await d.chord('Ctrl+2');
        await d.waitFor('.workspace', { timeoutMs: 15_000 }).catch(() => undefined);
        await d.chord('Escape');
        await sleep(200);
        if (overlay.chord !== undefined) await d.chord(overlay.chord);
        else {
          await d.chord('Ctrl+L');
          await sleep(250);
          for (const step of overlay.prelude ?? []) {
            if (step.click !== undefined) {
              await d.click(step.click, { timeoutMs: 8_000 }).catch(() => undefined);
              await sleep(500);
              await d.chord('Ctrl+L');
              await sleep(250);
              continue;
            }
            await d.chord('Ctrl+A');
            await d.type(step.text, { enter: false });
            await sleep(450);
            if (step.enter === true) { await d.chord('Return'); await sleep(500); }
          }
          // Select what is already there so the typing REPLACES it. Without this the previous overlay's
          // text survives and "/pop" is typed as "//pop", which opens nothing and reads as UNREACHED —
          // this pass's own first execution reported nine of those and not one was the product's.
          // Typed first, THEN submitted: a slash command whose Enter rides in the same burst arrives before
          // the popup has filtered, and the command never runs.
          await d.chord('Ctrl+A');
          await d.type(overlay.typed, { enter: false });
          await sleep(450);
          if (overlay.enter === true) { await d.chord('Return'); }
        }
        const open = await d.waitFor(overlay.root, { timeoutMs: 6_000 }).then(() => true).catch(() => false);
        if (!open) {
          note('UNREACHED', `overlay: ${overlay.name}`, size.label, { root: overlay.root, opener: overlay.chord ?? overlay.typed });
          await d.chord('Escape');
          await sleep(200);
          continue;
        }
        // An overlay that RISES into place (the popup's rt-rise, the palette's) is still moving when its root
        // matches, and a rectangle read mid-animation is a rectangle of nothing: the first execution measured
        // the popup's rows 300 px below where they settle, then the clip guard swallowed all thirty of them
        // and the surface reported clean without a single control having been tested. Wait for the animations
        // themselves rather than guessing a duration.
        await d.eval('Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => true)').catch(() => undefined);
        await sleep(350);
        const a = JSON.parse(await d.eval(OVERLAY_AUDIT(overlay.root)));
        if (a.tested === 0 && a.controls > 0) note('UNTESTED', `overlay: ${overlay.name}`, size.label, { controls: a.controls, clipped: a.clipped, why: 'every control was excluded as clipped — the sweep proved nothing' });
        await d.screenshot(join(output, `overlay-${overlay.name.replace(/\s+/g, '-')}-${size.label}.png`));
        if (a.outside) note('CONTAINMENT', `overlay: ${overlay.name}`, size.label, { box: a.box, viewport: a.viewport });
        if (!a.topmostAtCentre) note('STACKING', `overlay: ${overlay.name}`, size.label, { whole: 'the overlay is not topmost at its own centre', coveredBy: a.coveredBy, box: a.box });
        for (const b of a.buried) note('STACKING', `overlay: ${overlay.name}`, size.label, b);
        console.log(`${a.outside || !a.topmostAtCentre || a.buried.length ? 'FOUND' : 'CLEAN'}  overlay: ${overlay.name} @ ${size.label} (${a.tested} of ${a.controls} controls tested, ${a.clipped} clipped, ${a.box.w}x${a.box.h} at ${a.box.x},${a.box.y})`);
        await d.chord('Escape');
        await sleep(300);
      }
    }
  }
} finally {
  await d.quit().catch(() => undefined);
  d.close();
  try { if (started.child.pid) process.kill(started.child.pid); } catch { /* already gone after quit */ }
  const log = existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '';
  writeFileSync(join(output, 'app.log'), log);
  writeFileSync(join(output, 'report.json'), `${JSON.stringify({
    theme: theme === null ? null : String(theme),
    sizes: SIZES.map((size) => size.label),
    views: views.map((view) => view.name),
    findings,
  }, null, 2)}\n`);
  writeFileSync(join(output, 'geometry.json'), `${JSON.stringify({ captures: geometryEvidence }, null, 2)}\n`);
  writeFileSync(join(output, 'styles.json'), `${JSON.stringify({ captures: styleEvidence }, null, 2)}\n`);
}

const byKind = findings.reduce((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
console.log(`\n${findings.length} finding(s) ${JSON.stringify(byKind)} — evidence in ${output}`);
