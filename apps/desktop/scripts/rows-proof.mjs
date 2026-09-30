/**
 * The rows proof (Part AA; ADR-0051's SECOND execution). The ONE row renderer drawn in the real product, in both
 * of its surfaces at once, over the fixture array the plan's seam calls for — Part Z owns the projection that
 * would otherwise produce these displayed rows and is being built in parallel.
 *
 * Two launches against one scratch profile:
 *
 *   1. rows   — `ROTARIS_CAPTURE_OPEN_EXTERNAL=record`: the whole surface. REQ-CHAT-056's dialect rendered (a
 *               fenced block, a table, a task list, links) with raw HTML shown as TEXT and **no `<img>` anywhere**;
 *               REQ-CHAT-057's 52/112/30 px geometry measured from the live layout, with attribution on a block's
 *               first row and the 2 px persona bar on a continuation; REQ-CHAT-076's bare URL in a plain row and
 *               its authored link in a Markdown one both opening through `shell.openExternal` and both
 *               acknowledged, and a `file:` image reference REFUSED by scheme; REQ-CHAT-061's untruncated INPUT
 *               and OUTPUT on expansion; REQ-CHAT-065's group header copying as its summary and never as tool
 *               output; REQ-CHAT-075's pointer selection across a rendered-Markdown body; REQ-CHAT-167's and
 *               REQ-CHAT-067's two preferences taking effect immediately; and the persona window drawing the
 *               same row the Workspace does.
 *   2. refuse — `ROTARIS_CAPTURE_OPEN_EXTERNAL=fail`: the same link, the platform refusing, the failure REPORTED
 *               rather than passing silently (REQ-CHAT-076).
 *
 * **The network measurement is taken in the MAIN process, not in the page** (`ROTARIS_CAPTURE_NET=1` logs every
 * request this window's session issues), and it carries a positive control: the harness asks the page's own loader
 * for one same-origin subresource (`rows-proof-control-probe.css`), the same path an `<img>` would take, so "the two
 * image URLs are absent from the log" is a measurement by an observer known to be watching rather than a silence.
 * The control is same-origin because the renderer's policy is `connect-src 'none'` / `img-src 'self' data:`
 * (ADR-0056): a remote control would be stopped before the network layer and would never reach the observer.
 *
 * Evidence under `.proof/rows-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'rows-proof');
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

const expect = (cond, message) => { if (!cond) throw new Error(message); };


const W = '[data-testid="proof-workspace"]';
const P = '[data-testid="proof-persona"]';
const G = '[data-testid="proof-groups"]';
/** PD-CHAT-004's two surfaces: the same run drawn collapsed and drawn expanded. */
const A = '[data-testid="proof-activity"]';
const AO = '[data-testid="proof-activity-open"]';
/** PD-CHAT-004 rev. 2 / PD-CHAT-005: two agents working at once, the second delegated by the first. */
const IL = '[data-testid="proof-interleave"]';
const PROBES = [
  'img',
  `${W} [data-testid="row-markdown"]`, `${P} [data-testid="row-markdown"]`,
  `${W} .md__pre`, `${P} .md__pre`,
  `${W} .md__table th`, `${P} .md__table th`,
  `${W} .md__link`, `${P} .md__link`,
  `${W} [data-testid="row-markdown"] .md__link`, `${P} [data-testid="row-markdown"] .md__link`,
  `${W} .md__image`, `${P} .md__image`,
  `${W} .md__task`, `${W} .md__p`,
  `${W} .row`, `${P} .row`,
  `${W} .row__bar`, `${W} [data-testid="row-task"]`, `${W} .row__role`,
  `${W} [data-testid="tool-input"]`, `${W} [data-testid="tool-output"]`,
  `${W} [data-call-key="call-ok"]`, `${W} [data-call-key="call-failed"] .tool__outcome`, `${W} [data-call-key="call-blocked"] .tool__outcome`, `${W} [data-call-key="call-running"] .tool__outcome`,
  `${W} [data-testid="row-thinking"]`, `${W} [data-testid="thinking-body"]`,
  `${W} [data-testid="row-approval"] .row__trailer`, `${W} [data-testid="scope-toggle"]`,
  `${G} [data-testid="group-header"]`, `${G} [data-testid="group-members"] .row`, `${G} [data-testid="row-question"] .row__trailer`,
  `${G} [data-testid="group-members"] [data-testid="tool-input"]`,
  // PD-CHAT-004: the run's shape, its role gutter, its segments, its live word, and the expanded rule.
  `${A} [data-testid="row-group"]`, `${A} .row__role`, `${A} .activity__segment`, `${A} [data-testid="activity-now"]`,
  `${A} .row`, `${A} [data-testid="row-thinking"]`, `${A} .tool__preview`,
  `${AO} [data-testid="group-members"]`, `${AO} [data-testid="group-members"] .row`, `${AO} [data-testid="group-members"] .row__time`,
  `${AO} [data-testid="group-members"] .row__bar`,
  // PD-CHAT-004 rev 3: the facts the line is now drawn from, and the one of them that states a failure.
  `${A} .activity__fact`, `${A} .activity__fact--failed`, `${A} .activity__fact--blocked`,
  // PD-CHAT-006: the indicator that is gone, and the live row it used to sit on — the second selector is what
  // keeps the first from proving nothing, because an absence on a surface with no live row is not a measurement.
  '.row__streaming', `${W} [data-testid="row-agent"][data-settled="false"]`,
  // PD-CHAT-004 rev. 2 / PD-CHAT-005: one line per agent, the role in the persona's colour, the child indented.
  `${IL} [data-testid="row-group"]`, `${IL} .row`, `${IL} .row__role`, `${IL} .activity__segment`,
  '[data-testid="acknowledgement"]', '[data-testid="acknowledgement-title"]',
].join(';;');

async function launch(name, extra, timeoutMs = 150_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ profileRoot: root, local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES,
      ROTARIS_ROWS_PROOF: '1', ROTARIS_CAPTURE_NET: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}\n${log.slice(-3000)}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return { png, log, probes };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const inspect = (log, at, selector) => {
  const m = new RegExp(`capture: inspect-at ${at} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\{.*\\})\\s*$`, 'm').exec(log);
  return m ? JSON.parse(m[1]) : null;
};
const probesAt = (log, at, selector) => {
  const m = new RegExp(`capture: probe-at ${at} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])\\s*$`, 'm').exec(log);
  return m ? JSON.parse(m[1]).map((x) => x.text) : null;
};
const dragged = (log, at) => {
  const m = new RegExp(`capture: drag-at ${at} .* → ("(?:[^"\\\\]|\\\\.)*")\\s*$`, 'm').exec(log);
  return m ? JSON.parse(m[1]) : null;
};
/** One `eval-at` reading, found by a key the expression itself puts in the object it returns. */
const evalAt = (log, key) => {
  const m = new RegExp(`capture: eval-at \\d+ .*?${key}.*? → (\\{.*\\})\\s*$`, 'm').exec(log);
  return m ? JSON.parse(m[1]) : null;
};
/** Every request the MAIN process saw this window's session make. */
const requests = (log) => [...log.matchAll(/capture: net (\S+) (\S+) (\S+)\s*$/gm)].map((m) => ({ method: m[1], resourceType: m[2], url: m[3] }));

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Rows proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'mcp_servers:',
  '  code_intelligence: { enabled: false }',
  '',
].join('\n'));

const results = {};

// ── 1. The whole surface, with the open recorded rather than performed. ───────────────────────────────────
const r = await launch('rows', {
  ROTARIS_CAPTURE_OPEN_EXTERNAL: 'record',
  // The three activations REQ-CHAT-076 routes: a BARE url in a plain row, an AUTHORED link in a Markdown row,
  // and an image reference naming a location on this machine, which must be refused by its scheme.
  ROTARIS_CAPTURE_CLICKS: [
    `${W} .row--user .md__link@1800`,
    `${W} .md__link[data-href="https://rows-proof.invalid/spec"]@2400`,
    `${W} [data-image-href^="file:"]@3000`,
    `${W} [data-call-key="call-ok"] [data-testid="tool-header"]@3600`,
    `${G} [data-testid="group-header"]@4200`,
    // PD-CHAT-004: open the FIRST activity line on the second surface, so the continuous rule and the
    // members' own timestamps are measured in the product rather than seeded into the projection.
    `${AO} [data-testid="group-header"]@4400`,
    // R0-4: open the FIRST TOOL member's own header on that same surface, so its card — the gesture whose
    // caps the projection must lift — is opened by a real click and not by a seeded set. The run's first
    // member is a reasoning row with no card; the tool members carry `data-member-key` (the card's key,
    // `rowKey(member)`), and the click lands on the one the seeded projection opened.
    `${AO} [data-testid="group-members"] [data-member-key^="tool:"] [data-testid="tool-header"]@4600`,
    '[data-testid="proof-show-reasoning"]@6000',
    '[data-testid="proof-auto-collapse"]@7000',
    // REQ-CHAT-077: a row taking focus from a pointer, so the arrow keys have a current row to move from. The system
    // row is the one with no activatable child, so the click lands on the row itself and not on something inside it.
    `${W} .row--system@7900`,
  ].join(';;'),
  ROTARIS_CAPTURE_INSPECT_AT: [
    `${W} .row__time@1500`, `${W} .row__attribution@1500`, `${W} .row@1500`, `${W} .row__bar@1500`,
    `${G} [data-testid="group-header"]@5000`, `${G} [data-testid="row-group"]@5000`,
    `${A} [data-testid="group-header"]@5000`, `${A} [data-testid="row-group"]@5000`,
    `${AO} [data-testid="group-members"]@5000`,
    `${W} [data-call-key="call-blocked"] [data-testid="tool-header"]@5000`,
    `${W} [data-call-key="call-ok"]@7600`,
    // The Workspace's transcript is Part Z's pooled pane; `.rowlist` is the OTHER surface's container and
    // matched nothing here, which left these two readings resting on `active` alone.
    `${W} .transcript__pool@8100`, `${W} .transcript__pool@8500`,
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [
    `(() => [...document.querySelectorAll('${W} .transcript__slot[data-bound]')].map((slot) => { const style = getComputedStyle(slot); return { transform: style.transform, willChange: style.willChange }; }))()@1500`,
    // R0-4's count probes: the opened card's line count and its tail, read from the LIVE layout rather than
    // from the end probe — whose 400-character truncation is what produced the "15 of 30" misreading when
    // two truncated card texts were joined. The opened member is the only 30-line body in the run; the count
    // is unambiguous however the text is joined. Single-line expressions: the log parser's `eval-at` regex
    // cannot span newlines. `@5000`, beside the `group-members` inspect at the same time: the card is open
    // by then (the member click lands at 4600).
    `(() => document.querySelector('${AO} [data-testid="group-members"] .row--tool:nth-child(2) [data-testid="tool-output"]').textContent.split('line').length - 1)()@5000`,
    `(() => document.querySelector('${AO} [data-testid="group-members"] .row--tool:nth-child(2) [data-testid="tool-output"]').textContent.slice(-60))()@5000`,
    `(() => document.querySelector('${AO} [data-testid="group-members"] .row--tool:nth-child(2) [data-testid="tool-output"]').textContent.includes('cut short'))()@5000`,
    // PD-CHAT-004's rail is a COMPUTED border on the container, which `inspect-at` does not report; it is read
    // here, from the live layout, together with the two facts that make it "one continuous rule": that the
    // members draw no bar of their own, and that they all hang from this one element.
    `(() => { const el = document.querySelector('${AO} [data-testid="group-members"]'); if (!el) return { activityRail: null }; const s = getComputedStyle(el); return { activityRail: s.borderInlineStartWidth, railColour: s.borderInlineStartColor, railPad: s.paddingInlineStart, memberBars: el.querySelectorAll('.row__bar').length, members: el.children.length }; })()@5000`,
    // PD-CHAT-004 rev 3: the COLOURS of a line whose severity is `failed`, read from the live layout. A colour is
    // not in the DOM attributes `inspect-at` reports and a screenshot cannot be asserted on, so this is the only
    // place "only the failed fact is red" can be measured rather than argued. ONE line: the log parser's regex
    // for an `eval-at` reading cannot span newlines, which cost a null probe once already.
    `(() => { const line = document.querySelector('${A} [data-testid="row-group"][data-severity="failed"]'); if (!line) return { parts: [], chevron: null, span: null, reasoningSegments: -1 }; const read = (el) => ({ text: el.textContent.trim(), marked: /--failed|--blocked/.test(el.getAttribute('class') || ''), colour: getComputedStyle(el).color }); const parts = [...line.querySelectorAll('.activity__segment > span:not(.activity__sep)')].map(read); const seps = [...line.querySelectorAll('.activity__sep')].map((el) => getComputedStyle(el).color); const c = (sel) => { const el = line.querySelector(sel); return el === null ? null : getComputedStyle(el).color; }; return { parts, seps, chevron: c('.tool__chevron'), span: c('.tool__outcome'), reasoningSegments: line.querySelectorAll('.activity__segment--reasoning').length }; })()@5000`,
    // The OTHER half of the owner's sentence — "only the tool call that failed" is two claims, and the negative
    // one above proves nothing on its own: a build that coloured nothing red would pass it. This reads the
    // expanded run's failed member and an ok member beside it, so the positive claim is measured too.
    `(() => { const at = (sel) => document.querySelector('${AO} [data-testid="group-members"] ' + sel); const c = (el, inner) => { if (!el) return null; const t = el.querySelector(inner); return t === null ? null : getComputedStyle(t).color; }; const bad = at('.row--tool.tool--failed'); const good = at('.row--tool.tool--ok'); const fact = document.querySelector('${A} .activity__fact--failed'); return { failedMemberName: c(bad, '.tool__name'), failedMemberOutcome: c(bad, '.tool__outcome'), okMemberName: c(good, '.tool__name'), okMemberOutcome: c(good, '.tool__outcome'), lineFactColour: fact === null ? null : getComputedStyle(fact).color }; })()@5000`,
    // PD-CHAT-005 is a geometry and a colour, so both are read from the LIVE layout rather than asserted from
    // the class list: the left edge of each line's grid, which the indent moves, and the ink of each role
    // label, which must differ between the two agents and must be neither of them a status colour.
    `(() => { const probe = document.createElement('span'); document.body.appendChild(probe); const resolve = (t) => { probe.style.color = 'var(' + t + ')'; return getComputedStyle(probe).color; }; const status = ['--rt-ok', '--rt-run', '--rt-warn', '--rt-fail'].map(resolve); probe.remove(); const lines = [...document.querySelectorAll('${IL} [data-testid="row-group"]')]; return { status, interleave: lines.map((line) => { const grid = line.querySelector('.row__grid'); const role = line.querySelector('.row__role'); return { agent: line.getAttribute('data-agent'), depth: getComputedStyle(line).getPropertyValue('--rt-row-depth').trim(), pad: getComputedStyle(grid).paddingInlineStart, left: Math.round(grid.getBoundingClientRect().left), ink: role ? getComputedStyle(role).color : null, roleLeft: role ? Math.round(role.getBoundingClientRect().left) : null, timeWidth: Math.round(line.querySelector('.row__time').getBoundingClientRect().width), timeLeft: Math.round(line.querySelector('.row__time').getBoundingClientRect().left) }; }) }; })()@5000`,
  ].join(';;'),
  ROTARIS_CAPTURE_DRAG_AT: `${W} [data-testid="row-markdown"] .md__p@5400`,
  // The acknowledgement stack is transient (REQ-NOTIFY-011: 4200 ms), so each outcome is read beside the click that
  // raised it rather than at the end, where the requirement's own lifetime would have removed it.
  ROTARIS_CAPTURE_PROBE_AT: [
    '[data-testid="acknowledgement-title"]@2100',
    '[data-testid="acknowledgement-title"]@2700',
    '[data-testid="acknowledgement-title"]@3300',
    `${W} [data-testid="thinking-body"]@5800`,
    `${W} [data-testid="thinking-header"]@5800`,
    `${W} [data-testid="thinking-body"]@6400`,
    `${W} [data-testid="thinking-header"]@6400`,
  ].join(';;'),
  // REQ-CHAT-077: one arrow press between the two inspections above, so "the current row moves" is measured rather than asserted.
  ROTARIS_CAPTURE_KEYS: 'Down@8300',
  ROTARIS_CAPTURE_AFTER_MS: '8900',
});

const rasterCapture = new RegExp('capture: eval-at 1500 .*? \\u2192 (.*)\\s*$', 'm').exec(r.log);
let rasterSlots = [];
try { rasterSlots = rasterCapture ? JSON.parse(rasterCapture[1]) : []; } catch { rasterSlots = []; }

// REQ-CHAT-056: no image is EVER loaded from a Markdown image reference — measured from the main process, with
// the harness's own control request proving the observer was watching.
const net = requests(r.log);
const control = net.filter((q) => q.url.includes('rows-proof-control-probe'));
expect(control.length >= 1, `the network observer saw no control request, so its silence proves nothing: ${JSON.stringify(net)}`);
const imageRequests = net.filter((q) => /remote-image\.png|local-image\.png/.test(q.url));
expect(imageRequests.length === 0, `a request left the process for a Markdown image reference: ${JSON.stringify(imageRequests)}`);
expect(text(r.probes, 'img').length === 0, 'an <img> element exists in the transcript; no code path may produce one');
results.noImageLoad = { requestsSeen: net.length, controlSeen: control.length, imageRequests: 0, imgElements: 0, sample: net.slice(0, 12) };

// REQ-CHAT-056: the dialect rendered, and raw HTML shown as the text it is.
const pre = text(r.probes, `${W} .md__pre`);
const headers = text(r.probes, `${W} .md__table th`);
const links = text(r.probes, `${W} .md__link`);
const images = text(r.probes, `${W} .md__image`);
// Three agent rows render Markdown; two of them carry the whole dialect (the third is the streaming one-liner), and
// a table header pair is what identifies one, so the per-body figures below are counted against that.
const bodiesInWorkspace = text(r.probes, `${W} [data-testid="row-markdown"]`).length;
const dialectBodies = headers.length / 2;
const tasks = (r.probes[`${W} .md__task`] ?? []).length;
expect(pre.some((t) => t.includes('const fenced = "code block";')), `no fenced code block was rendered: ${JSON.stringify(pre)}`);
expect([...new Set(headers)].join('|') === 'column|meaning', `the table header was not rendered: ${JSON.stringify(headers)}`);
expect(links.includes('link to the specification'), `the authored link was not rendered: ${JSON.stringify(links)}`);
expect(links.some((t) => t.startsWith('https://rows-proof.invalid/bare-one')), `the bare URL was not linkified: ${JSON.stringify(links)}`);
expect(images.includes('a remote picture') && images.includes('a local picture'), `an image reference did not render as its alternative text: ${JSON.stringify(images)}`);
expect(bodiesInWorkspace === 3, `the Workspace drew ${bodiesInWorkspace} Markdown bodies, not 3`);
expect(dialectBodies === 2, `the Workspace drew ${dialectBodies} whole-dialect bodies, not 2`);
expect(tasks === 2 * dialectBodies, `the task list rendered ${tasks} boxes across ${dialectBodies} bodies`);
const paragraphs = text(r.probes, `${W} .md__p`);
expect(paragraphs.some((t) => t.includes('<script>') && t.includes('</script>')), `raw HTML was not shown as text: ${JSON.stringify(paragraphs)}`);
results.dialect = { markdownBodies: bodiesInWorkspace, dialectBodies, fencedBlocks: pre.length, tableHeaders: [...new Set(headers)], links: links.length, images: [...new Set(images)], taskBoxes: tasks, rawHtmlAsText: true };

// REQ-CHAT-057: the stated geometry, measured from the live layout.
const times = inspect(r.log, 1500, `${W} .row__time`);
const attribution = inspect(r.log, 1500, `${W} .row__attribution`);
const rowRects = inspect(r.log, 1500, `${W} .row`);
const bars = inspect(r.log, 1500, `${W} .row__bar`);
expect(times && times.matches.length > 0, 'no timestamp column was measured');
const timeWidths = [...new Set(times.matches.map((m) => Math.round(m.rect.width)))];
const roleWidths = [...new Set(attribution.matches.map((m) => Math.round(m.rect.width)))];
const minRowHeight = Math.min(...rowRects.matches.map((m) => m.rect.height));
expect(timeWidths.length === 1 && timeWidths[0] === 52, `the timestamp column measured ${JSON.stringify(timeWidths)} px, not 52`);
expect(roleWidths.length === 1 && roleWidths[0] === 112, `the role column measured ${JSON.stringify(roleWidths)} px, not 112`);
expect(minRowHeight >= 16 && minRowHeight <= 22, `the compact one-line row measured ${minRowHeight} px; PD-CHAT-003 expects its content line`);
expect(rasterSlots.length > 0, 'the Workspace yielded no bound transcript slots for the rasterization check');
expect(rasterSlots.every((slot) => slot.willChange === 'auto'), `Workspace slots requested persistent compositor promotion: ${JSON.stringify(rasterSlots)}`);
expect(rasterSlots.every((slot) => slot.transform !== 'none'), `Workspace slots lost their recycler coordinate transform: ${JSON.stringify(rasterSlots)}`);
const fontSize = times.matches[0].attrs.class.includes('mono');
expect(fontSize, 'the timestamp is not drawn in the monospace stack');
// Attribution on the first row of a block only; a continuation shows the 2 px persona bar instead.
const barWidths = [...new Set((bars?.matches ?? []).map((m) => Math.round(m.rect.width)))];
expect(bars && bars.matches.length > 0, 'no continuation row drew the persona gutter bar (REQ-CHAT-057)');
expect(barWidths.length === 1 && barWidths[0] === 2, `the persona bar measured ${JSON.stringify(barWidths)} px, not 2`);
const roleCount = text(r.probes, `${W} .row__role`).length;
const rowCount = text(r.probes, `${W} .row`).length;
expect(roleCount < rowCount, `every row drew attribution (${roleCount} of ${rowCount}); continuation rows must not`);
expect(text(r.probes, `${W} [data-testid="row-task"]`).includes('helper'), 'the task line did not name the row\'s task');
results.geometry = { timestampColumnPx: timeWidths[0], roleColumnPx: roleWidths[0], minRowHeightPx: Math.round(minRowHeight), personaBarPx: barWidths[0], rows: rowCount, attributionRows: roleCount, continuationBars: bars.matches.length };
results.rasterization = { boundSlots: rasterSlots.length, defaultWillChange: true, transformedSlots: true };

// REQ-CHAT-060: the four outcomes, and a glyph already in the text drawn once.
const okRow = (r.probes[`${W} [data-call-key="call-ok"]`] ?? [])[0] ?? { text: '' };
expect(!okRow.text.includes('✓'), `the persisted ✓ glyph was drawn again: ${JSON.stringify(okRow.text)}`);
expect(okRow.text.includes('ok · 3.2s'), `the ok outcome was not drawn: ${JSON.stringify(okRow.text)}`);
const failed = text(r.probes, `${W} [data-call-key="call-failed"] .tool__outcome`)[0];
const blocked = text(r.probes, `${W} [data-call-key="call-blocked"] .tool__outcome`)[0];
const running = text(r.probes, `${W} [data-call-key="call-running"] .tool__outcome`)[0];
expect(failed === 'failed' && blocked === 'blocked · 0.0s' && running === '◉ running…', `the outcomes read ${JSON.stringify([failed, blocked, running])}`);
const blockedHeader = inspect(r.log, 5000, `${W} [data-call-key="call-blocked"] [data-testid="tool-header"]`);
const blockedDescription = blockedHeader?.matches?.[0]?.attrs?.['aria-description'] ?? '';
expect(/^Blocked: a recursive delete/.test(blockedDescription), `the blocked reason is not reachable from the row's accessible description: ${JSON.stringify(blockedDescription)}`);
results.outcomes = { ok: okRow.text, failed, blocked, running, blockedDescription };

// REQ-CHAT-061: expansion shows the UNTRUNCATED input and output.
const input = text(r.probes, `${W} [data-testid="tool-input"]`)[0] ?? '';
const output_ = text(r.probes, `${W} [data-testid="tool-output"]`)[0] ?? '';
expect(input.includes('README.md'), `the expanded card carried no input: ${JSON.stringify(input)}`);
expect(output_.includes('line one') && output_.includes('line three'), `the expanded card truncated the output: ${JSON.stringify(output_)}`);
results.expansion = { input, output: output_ };

// REQ-CHAT-065: the group header copies as its summary and never as tool output.
const groupHeader = inspect(r.log, 5000, `${G} [data-testid="group-header"]`);
const summary = groupHeader?.matches?.[0]?.attrs?.['aria-description'] ?? '';
expect(summary === 'reading ×4 · 3 ok · 1 failed', `the group's accessible description read ${JSON.stringify(summary)}`);
expect(!summary.includes('MEMBER-OUTPUT'), 'the group summary carried raw tool output');
const members = text(r.probes, `${G} [data-testid="group-members"] .row`);
expect(members.length === 4, `expanding the group revealed ${members.length} members, not 4`);
// REQ-CHAT-059 keys a group by its FIRST member's call key, so the group and that member carry the same string.
// Expanding the group must not therefore expand that member: one map keyed by the string alone opens both.
const memberCards = text(r.probes, `${G} [data-testid="group-members"] [data-testid="tool-input"]`);
expect(memberCards.length === 0, `expanding the group also expanded a member's card (the REQ-CHAT-059 key collision): ${JSON.stringify(memberCards)}`);
const groupArticle = inspect(r.log, 5000, `${G} [data-testid="row-group"]`);
const groupClass = groupArticle?.matches?.[0]?.attrs?.class ?? '';
expect(groupClass.includes('tool--failed') && groupArticle.matches[0].attrs['data-severity'] === 'failed', `the group did not take the most severe outcome's colour: ${JSON.stringify(groupClass)}`);
// REQ-CHAT-168: the question trailers agree with their counts at one and at many.
const questions = text(r.probes, `${G} [data-testid="row-question"] .row__trailer`);
expect(questions.includes('3 steps — Choose a branch') && questions.includes('1 step — Confirm the target'), `the question trailers read ${JSON.stringify(questions)}`);
results.group = { summary, membersRevealed: members.length, memberCardsOpened: memberCards.length, severityClass: groupClass, questionTrailers: questions };

// ── PD-CHAT-004 — the activity line, in the product ───────────────────────────────────────────────────────
// The fixture is ONE agent thinking and reading in turn — the sequence the owner reported as two alternating
// speakers — then a message, then a second agent's live run.
const activityRows = (r.probes[`${A} [data-testid="row-group"]`] ?? []);
expect(activityRows.length === 2, `the fixture drew ${activityRows.length} activity lines, not 2 (one per agent)`);
// (a) The alternation is gone: seven rows of one agent's work are ONE displayed row, and the whole surface is
//     three rows — line, message, line — where the defect drew nine.
const activityAll = text(r.probes, `${A} .row`);
expect(activityAll.length === 3, `the surface drew ${activityAll.length} rows, not 3 (line, message, line)`);
// (b) The role gutter names the AGENT and never an activity word — the defect this repairs put `reading` here.
const activityRoles = text(r.probes, `${A} .row__role`);
expect(!activityRoles.some((role) => ['reading', 'searching', 'editing', 'running', 'reasoning'].includes(role)),
  `an activity word reached the role gutter: ${JSON.stringify(activityRoles)}`);
// TWO attributions for THREE rows, which is the repair working: the orchestrator's line and the message that
// follows it are one block, so REQ-CHAT-057 draws the role once and a persona bar on the continuation. Under
// the defect this surface drew an attribution on every row and never a bar.
expect(activityRoles.length === 2 && activityRoles[0] === 'orchestrator' && activityRoles[1] === 'coding-agent',
  `the lines named ${JSON.stringify(activityRoles)}`);
// (c) No reasoning row survives as a row of its own inside a run — they are members of the line.
const looseThinking = r.probes[`${A} [data-testid="row-thinking"]`] ?? [];
expect(looseThinking.length === 0, `${looseThinking.length} reasoning rows were drawn beside the line rather than inside it`);
// (d) PD-CHAT-004 revision 2: ONE segment per activity word, carrying that word's totals, in the order the
//     words first appear. Revision 1 read `reasoning ×1 …, reading ×2 …, reasoning ×1 …, reading ×2 …,
//     searching ×1 …` for this same fixture — five segments for seven rows, which is the line growing with
//     the work exactly as the appended rows it replaced did.
const segments = text(r.probes, `${A} .activity__segment`);
const firstLine = inspect(r.log, 5000, `${A} [data-testid="group-header"]`);
const activitySummary = firstLine?.matches?.[0]?.attrs?.['aria-description'] ?? '';
expect(activitySummary === 'reasoning ×2 · 17s · ~587 tok, reading ×4 · 4 ok, searching ×1 · 1 failed',
  `the line's accessible description read ${JSON.stringify(activitySummary)}`);
expect(!activitySummary.includes('ACTIVITY-OUTPUT'), 'the activity summary carried raw tool output');
// (e) REQ-CHAT-065's severity ordering is still what the line PUBLISHES — PD-CHAT-004 rev 3 leaves the ordering
//     untouched and takes only its power to colour the whole line.
const firstArticle = inspect(r.log, 5000, `${A} [data-testid="row-group"]`);
const firstClass = firstArticle?.matches?.[0]?.attrs?.class ?? '';
expect(firstClass.includes('tool--failed'), `the line did not take the most severe outcome's colour: ${JSON.stringify(firstClass)}`);
expect(firstArticle?.matches?.[0]?.attrs?.['data-segments'] === '3', `the line published ${firstArticle?.matches?.[0]?.attrs?.['data-segments']} segments, not 3`);
// (e2) PD-CHAT-004 rev 3: and the failure is coloured WHERE IT HAPPENED. Read from the live layout, because a
//      colour is in neither the attributes nor a screenshot anything can be asserted against.
const colours = evalAt(r.log, 'reasoningSegments');
const parts = colours?.parts ?? [];
const marked = parts.filter((p) => p.marked);
const plain = parts.filter((p) => !p.marked);
// Anti-vacuity, both ways: the line must actually hold a failure, and must actually hold facts that are not one.
// Without these the assertions below pass on a line that states nothing, which is a finding and not a proof.
expect(marked.length === 1 && marked[0].text === '1 failed', `the line's failure facts read ${JSON.stringify(marked)}`);
expect(plain.length >= 6, `the line drew only ${plain.length} facts that state no failure, so "everything else keeps its colour" is untested`);
expect(colours?.reasoningSegments >= 1, `the line held ${colours?.reasoningSegments} reasoning segments, so "reasoning is never coloured as failed" is untested`);
const failColour = marked[0].colour;
const sameAsFail = plain.filter((p) => p.colour === failColour);
expect(sameAsFail.length === 0, `${sameAsFail.length} facts that state no failure took the fail colour ${failColour}: ${JSON.stringify(sameAsFail)}`);
// The chevron and the run's elapsed span are the two parts of the line outside the segments; under revision 1
// both went red with the run, and the chevron is the half the segment rules alone never reached.
expect(colours?.chevron !== null && colours.chevron !== failColour, `the line's chevron took the fail colour ${failColour}`);
expect(colours?.span !== null && colours.span !== failColour, `the run's elapsed span took the fail colour ${failColour}`);
// The dot before `1 failed` belongs to neither fact, so it takes neither's colour.
const sepsFail = (colours?.seps ?? []).filter((c) => c === failColour);
expect(sepsFail.length === 0, `${sepsFail.length} fact separators took the fail colour ${failColour}`);
// (e3) And the call that DID fail is still coloured — REQ-CHAT-060 governs a tool row drawn as its own row, and
//      revision 3 leaves it in full. Without this the assertions above pass on a build that colours nothing.
const memberColours = evalAt(r.log, 'failedMemberName');
expect(memberColours?.lineFactColour === failColour, `the two readings disagreed on the fail colour: ${JSON.stringify(memberColours)}`);
expect(memberColours?.failedMemberName === failColour, `the failed member's name did not take the fail colour: ${JSON.stringify(memberColours)}`);
expect(memberColours?.failedMemberOutcome === failColour, `the failed member's outcome did not take the fail colour: ${JSON.stringify(memberColours)}`);
expect(memberColours?.okMemberName !== null && memberColours.okMemberName !== failColour, `an ok member's name took the fail colour: ${JSON.stringify(memberColours)}`);
expect(memberColours?.okMemberOutcome !== null && memberColours.okMemberOutcome !== failColour, `an ok member's outcome took the fail colour: ${JSON.stringify(memberColours)}`);
// (f) The live run states what it is doing NOW and carries that call's text on the preview line.
const now = text(r.probes, `${A} [data-testid="activity-now"]`);
expect(now.length === 1 && now[0] === 'running…', `the in-flight activity word read ${JSON.stringify(now)}`);
const preview = text(r.probes, `${A} .tool__preview`);
expect(preview.some((line) => line.includes('bash pnpm test')), `the in-flight call's text was not on the preview line: ${JSON.stringify(preview)}`);
// (g) Expanded: ONE continuous rule in the agent's persona colour, the members hanging from it, each keeping
//     its own timestamp and drawing no bar of its own. C's contribution, measured rather than asserted.
const rail = evalAt(r.log, 'activityRail');
const railWidth = Number.parseFloat(String(rail?.activityRail ?? '0'));
expect(railWidth >= 2, `the expanded run's rule measured ${JSON.stringify(rail?.activityRail)}, not the 2 px continuous rail`);
// It is ONE rule, in the agent's persona colour: every member hangs from this single element and none draws a
// bar of its own, which is the difference between a continuous line and a dashed column of per-row borders.
expect(rail?.memberBars === 0, `${rail?.memberBars} members drew a persona bar of their own beside the continuous rule`);
expect(rail?.members === 7, `the rule spanned ${rail?.members} members, not the run's 7`);
const openMembers = text(r.probes, `${AO} [data-testid="group-members"] .row`);
expect(openMembers.length === 7, `expanding the run revealed ${openMembers.length} members, not 7`);
const memberTimes = text(r.probes, `${AO} [data-testid="group-members"] .row__time`).filter((t) => t !== '');
expect(memberTimes.length === 7, `${memberTimes.length} of 7 revealed members carried a timestamp — the per-step instants are what expanding is for`);
// R0-4 (REQ-CHAT-061/166): the opened member's card carries the FULL 30-line output — the first
// `read_file` member's every line, the only 30-line body in the run — while the other members' rows carry
// none and the line's own summary carries none of it. Read from the LIVE layout (`eval-at`): the end probe
// truncates every text to 400 characters, so joining the truncated card texts misreads "15 of 30" for a
// card that holds all thirty — the count below reads the card's own text, untruncated, where it stands.
const r0count = Number((/capture: eval-at 5000 .*nth-child\(2\) \[data-testid="tool-output"[^`]*split\('line'\).*→ (\d+)\s*$/m.exec(r.log) ?? [])[1]);
const r0tail = (/capture: eval-at 5000 .*nth-child\(2\) \[data-testid="tool-output"[^`]*slice\(-60\).*→ "(.*)"\s*$/m.exec(r.log) ?? [])[1] ?? '';
const r0cut = (/capture: eval-at 5000 .*nth-child\(2\) \[data-testid="tool-output"[^`]*includes\('cut short'\).*→ (\w+)\s*$/m.exec(r.log) ?? [])[1] ?? '?';
expect(r0count === 30, `the opened member's card carried ${JSON.stringify(r0count)} 'line' occurrences, not 30`);
expect(r0tail.includes('line 29'), `the opened member's card did not reach its last line: ${JSON.stringify(r0tail)}`);
expect(r0cut === 'false', 'the opened member still carries a truncation marker');
const closedSummary = activitySummary;
expect(!closedSummary.includes('ACTIVITY-OUTPUT'), 'the activity summary carried raw tool output');
// The SIBLINGS stay capped: the collapsed surface draws no member card at all, and the opened surface draws
// no second card — the expansion is per member, not per line. Without this the assertions above pass on a
// build that lifted the caps for all.
const collapsedSiblingOutputs = text(r.probes, `${A} [data-testid="group-members"] [data-testid="tool-output"]`);
expect(collapsedSiblingOutputs.length === 0, `the collapsed surface drew ${collapsedSiblingOutputs.length} member cards`);
results.memberCaps = { openMemberLines: r0count, openMemberTail: r0tail, openMemberTruncated: r0cut !== 'false' };
// PD-CHAT-006: a row still being written draws no animated indicator of its own. The absence is only a
// measurement beside the live row it used to sit on, so both are counted.
const liveMessageRows = (r.probes[`${W} [data-testid="row-agent"][data-settled="false"]`] ?? []).length;
const streamingMarks = (r.probes['.row__streaming'] ?? []).length;
expect(liveMessageRows >= 1, 'no live message row was drawn, so the absence of the animated indicator proves nothing');
expect(streamingMarks === 0, `${streamingMarks} animated "…" indicators were drawn on rows still being written`);
results.activityLine = {
  lines: activityRows.length, rowsDrawn: activityAll.length, roles: activityRoles, looseReasoningRows: looseThinking.length,
  summary: activitySummary, segments, severityClass: firstClass, inFlightWord: now[0] ?? null,
  failColour, factsColouredFail: marked.length, factsPlain: plain.length, reasoningSegments: colours?.reasoningSegments ?? null,
  chevronColour: colours?.chevron ?? null, spanColour: colours?.span ?? null,
  failedMemberName: memberColours?.failedMemberName ?? null, okMemberName: memberColours?.okMemberName ?? null,
  openMemberLines: results.memberCaps.openMemberLines, openMemberTruncated: results.memberCaps.openMemberTruncated,
  liveMessageRows, streamingMarks,
  railWidthPx: railWidth, railColour: rail?.railColour ?? null, membersRevealed: openMembers.length,
  memberTimestamps: memberTimes.length, memberBars: rail?.memberBars ?? null,
};

// ── PD-CHAT-004 rev. 2 / PD-CHAT-005 — two agents at once ─────────────────────────────────────────────────
// The fixture is the owner's screenshot of 2026-09-16: ten rows of two agents' work, alternating in the
// record, under one user prompt. Revision 1 drew five lines of two and re-stated a timestamp and a role on
// every one of them, because a row of a different agent ended the run.
const weaveLines = r.probes[`${IL} [data-testid="row-group"]`] ?? [];
expect(weaveLines.length === 2, `the interleaved fixture drew ${weaveLines.length} activity lines, not 2 (one per agent)`);
const weaveRows = text(r.probes, `${IL} .row`);
expect(weaveRows.length === 3, `the surface drew ${weaveRows.length} rows, not 3 (the prompt and one line per agent)`);
// Each agent's whole run is on its own line, so the words are totals rather than one segment per step.
const weaveSegments = text(r.probes, `${IL} .activity__segment`);
expect(weaveSegments.length === 4, `the two lines carried ${weaveSegments.length} segments, not 4 (reasoning + reading, reasoning + searching)`);
// PD-CHAT-004 rev. 2: each agent thought twice with tool calls BETWEEN the two, and each line states that as ONE
// reasoning segment carrying the totals. Revision 1 drew `reasoning ×1 · … · reasoning ×1`, which is the growth
// the owner's screenshot showed. The families themselves still differ per agent, so nothing was merged across them.
expect(weaveSegments.filter((t) => /^reasoning ×2 · /.test(t)).length === 2,
  `the two split thinking runs were not each stated as one segment with totals: ${JSON.stringify(weaveSegments)}`);
expect(weaveSegments.some((t) => /^reading ×3 /.test(t)) && weaveSegments.some((t) => /^searching ×3 · 2 ok · 1 running/.test(t)),
  `the per-agent families or the in-flight word did not survive the fold: ${JSON.stringify(weaveSegments)}`);
const weave = evalAt(r.log, 'interleave')?.interleave ?? [];
expect(weave.length === 2, `the live layout reported ${weave.length} lines, not 2`);
const [parentLine, childLine] = weave;
// (a) PD-CHAT-005: the delegated agent's rows are indented one step, and the root's are not. Measured from
//     the live boxes, so a rule that did not apply cannot pass by being declared.
expect(parentLine.pad === '0px' || parentLine.pad === '', `the root agent's line was indented by ${parentLine.pad}`);
expect(childLine.depth === '1', `the delegated agent's line published depth ${JSON.stringify(childLine.depth)}, not 1`);
expect(Number.parseFloat(childLine.pad) === 16, `the delegated agent's line indented by ${childLine.pad}, not the language's 16 px step`);
expect(childLine.roleLeft - parentLine.roleLeft === 16, `the two role labels sat ${childLine.roleLeft - parentLine.roleLeft} px apart, not one 16 px step`);
// (b) REQ-CHAT-057's columns are UNTOUCHED by the indent — it moves the grid, it does not resize it. The
//     movement is the directive's fourth declared cost, so it is measured rather than assumed: the child's
//     timestamp starts one step right of the parent's, which is what makes the time gutter a stepped column.
expect(parentLine.timeWidth === childLine.timeWidth, `the indent resized the timestamp column: ${parentLine.timeWidth} vs ${childLine.timeWidth}`);
expect(childLine.timeLeft - parentLine.timeLeft === 16, `the timestamps stepped by ${childLine.timeLeft - parentLine.timeLeft} px, not the one step PD-CHAT-005 declares`);
// (c) PD-CHAT-005: the role label carries the persona's own colour, and the two agents differ in it.
expect(parentLine.ink && childLine.ink && parentLine.ink !== childLine.ink,
  `the two agents' role labels were drawn in the same ink: ${JSON.stringify([parentLine.ink, childLine.ink])}`);
// The ramp is categorical and none of it is a status colour — the falsified palette named the outcome tokens,
// two of which resolve to ONE value, so a persona could read as a verdict. The status colours are resolved from
// the running theme rather than written here, so the check cannot drift from the theme data it is about.
const statusInks = evalAt(r.log, 'interleave')?.status ?? [];
expect(statusInks.length === 4, `the status tokens did not resolve in the live theme: ${JSON.stringify(statusInks)}`);
for (const ink of [parentLine.ink, childLine.ink]) {
  expect(!statusInks.includes(ink), `a status colour was used as a persona ink: ${ink} is one of ${JSON.stringify(statusInks)}`);
}
results.interleave = {
  lines: weaveLines.length, rowsDrawn: weaveRows.length, segments: weaveSegments,
  depths: weave.map((l) => ({ agent: l.agent, depth: l.depth, pad: l.pad, ink: l.ink })),
  roleStepPx: childLine.roleLeft - parentLine.roleLeft, timestampColumnPx: parentLine.timeWidth,
  timestampStepPx: childLine.timeLeft - parentLine.timeLeft,
  statusInks,
};

// REQ-CHAT-076: the two opens, both acknowledged; the `file:` reference refused by its scheme.
const opened = [...r.log.matchAll(/capture: open-external (\S+)/g)].map((m) => m[1]);
expect(opened.includes('https://rows-proof.invalid/from-a-user-row'), `the BARE url in a plain row did not open: ${JSON.stringify(opened)}`);
expect(opened.includes('https://rows-proof.invalid/spec'), `the authored link did not open: ${JSON.stringify(opened)}`);
expect(!opened.some((u) => u.startsWith('file:')), `a file: reference was handed to the platform: ${JSON.stringify(opened)}`);
const bareAck = probesAt(r.log, 2100, '[data-testid="acknowledgement-title"]') ?? [];
const linkAck = probesAt(r.log, 2700, '[data-testid="acknowledgement-title"]') ?? [];
const schemeAck = probesAt(r.log, 3300, '[data-testid="acknowledgement-title"]') ?? [];
expect(bareAck.some((t) => /Opened in your browser/.test(t)), `the bare URL's open was not acknowledged: ${JSON.stringify(bareAck)}`);
expect(linkAck.some((t) => /Opened in your browser/.test(t)), `the authored link's open was not acknowledged: ${JSON.stringify(linkAck)}`);
// REQ-CHAT-076: a failure to open is REPORTED. A `file:` reference is refused by its scheme before the platform is asked.
expect(schemeAck.some((t) => /could not be opened/i.test(t)), `the file: reference was not reported as refused: ${JSON.stringify(schemeAck)}`);
expect(/link\.scheme|Only http and https/.test(r.log) || schemeAck.length > 0, 'the scheme refusal left no trace');
results.opening = { opened, bareAck, linkAck, schemeAck };

// REQ-CHAT-075: a POINTER selection across a rendered-Markdown body takes the characters it covers.
const selection = dragged(r.log, 5400);
expect(selection !== null && selection.length > 20, `the pointer selection over a Markdown body took ${JSON.stringify(selection)}`);
results.selection = { characters: selection.length, sample: selection.slice(0, 80) };

// REQ-CHAT-167: the reasoning body is hidden by default and revealed the moment the preference is turned on.
const beforeReasoning = probesAt(r.log, 5800, `${W} [data-testid="thinking-body"]`) ?? [];
const afterReasoning = probesAt(r.log, 6400, `${W} [data-testid="thinking-body"]`) ?? [];
expect(beforeReasoning.length === 0, 'a reasoning body was drawn with display/showReasoning off');
expect(afterReasoning.length === 1, 'turning display/showReasoning on did not reveal the reasoning body');
// REQ-CHAT-062: the collapsed summary is `▸ reasoning · <N>s · ~<T> tok`, and that leading marker IS the row's
// chevron — a chevron drawn beside a marker states one state twice, which is what this launch caught when it first ran.
const collapsedSummary = (probesAt(r.log, 5800, `${W} [data-testid="thinking-header"]`) ?? [])[0] ?? '';
const expandedSummary = (probesAt(r.log, 6400, `${W} [data-testid="thinking-header"]`) ?? [])[0] ?? '';
expect(/^▸\s*reasoning · \d+s · ~\d+ tok$/.test(collapsedSummary), `the collapsed reasoning summary read ${JSON.stringify(collapsedSummary)}`);
expect(/^▾\s*reasoning · \d+s · ~\d+ tok$/.test(expandedSummary), `the expanded reasoning header read ${JSON.stringify(expandedSummary)}`);
results.showReasoning = { hiddenByDefault: true, revealedOnToggle: true, collapsedSummary, expandedSummary };

// REQ-CHAT-067: with auto-collapse on, a tool row outside the most recent pair is name-plus-chevron — no preview.
const collapsed = inspect(r.log, 7600, `${W} [data-call-key="call-ok"]`);
expect(collapsed?.matches?.[0]?.attrs?.['data-collapsed'] === 'name', `auto-collapse did not take the row to name-plus-chevron: ${JSON.stringify(collapsed?.matches?.[0]?.attrs)}`);
results.autoCollapseTools = { collapsedToName: true };

// REQ-CHAT-077: the arrow keys move the current row, the current row being the focused one.
const focusedBefore = inspect(r.log, 8100, `${W} .transcript__pool`)?.active ?? null;
const focusedAfter = inspect(r.log, 8500, `${W} .transcript__pool`)?.active ?? null;
const isRow = (el) => Boolean(el) && String(el.className ?? '').split(' ').includes('row');
expect(isRow(focusedBefore), `the pointer did not make a row current: ${JSON.stringify(focusedBefore)}`);
expect(isRow(focusedAfter), `after ArrowDown the current row was ${JSON.stringify(focusedAfter)}`);
expect(JSON.stringify(focusedBefore) !== JSON.stringify(focusedAfter), `ArrowDown did not move the current row: ${JSON.stringify(focusedBefore)}`);
results.keyboard = { before: focusedBefore, after: focusedAfter };

// Part R's rule: the persona window draws the SAME row the Workspace does.
const fingerprint = (scope) => {
  const bodies = text(r.probes, `${scope} .md__table th`).length / 2;
  const per = (selector) => text(r.probes, `${scope} ${selector}`).length / Math.max(1, bodies);
  return {
    markdownBodies: text(r.probes, `${scope} [data-testid="row-markdown"]`).length,
    dialectBodies: bodies,
    fencedPerBody: per('.md__pre'),
    tableHeadersPerBody: per('.md__table th'),
    // Scoped INSIDE a rendered body: the Workspace also carries a bare URL in a plain user row, which is
    // REQ-CHAT-076's other half and not part of what the two surfaces must draw identically.
    linksPerBody: per('[data-testid="row-markdown"] .md__link'),
    imageAltText: [...new Set(text(r.probes, `${scope} .md__image`))].join('|'),
  };
};
const inWorkspace = fingerprint(W);
const inPersona = fingerprint(P);
expect(inPersona.dialectBodies === 1, `the persona window drew ${inPersona.dialectBodies} whole-dialect bodies`);
expect(inPersona.imageAltText === inWorkspace.imageAltText, `the two surfaces drew different image references: ${JSON.stringify({ inWorkspace, inPersona })}`);
for (const key of ['fencedPerBody', 'tableHeadersPerBody', 'linksPerBody']) {
  expect(inWorkspace[key] === inPersona[key], `the two surfaces drew a different ${key}: ${JSON.stringify({ inWorkspace, inPersona })}`);
}
results.oneRenderer = { workspace: inWorkspace, persona: inPersona };

// REQ-CHAT-051 and REQ-CHAT-069, drawn by the same renderer as everything else.
expect(text(r.probes, `${W} [data-testid="row-approval"] .row__trailer`)[0] === 'Approval needed — git push origin main', `the approval trailer read ${JSON.stringify(text(r.probes, `${W} [data-testid="row-approval"] .row__trailer`))}`);
expect((text(r.probes, `${W} [data-testid="scope-toggle"]`)[0] ?? '').includes('All activity'), 'the scope toggle was not drawn');
results.trailerAndScope = { approval: text(r.probes, `${W} [data-testid="row-approval"] .row__trailer`)[0], scope: text(r.probes, `${W} [data-testid="scope-toggle"]`)[0] };
results.png = r.png;

// ── 2. The refusal, reported rather than passed silently. ─────────────────────────────────────────────────
const refuse = await launch('refuse', {
  ROTARIS_CAPTURE_OPEN_EXTERNAL: 'fail',
  ROTARIS_CAPTURE_CLICKS: `${W} .md__link[data-href="https://rows-proof.invalid/spec"]@1800`,
  ROTARIS_CAPTURE_AFTER_MS: '3200',
});
expect(/capture: open-external REFUSED https:\/\/rows-proof.invalid\/spec/.test(refuse.log), 'the scripted refusal never reached main');
const refusalAcks = text(refuse.probes, '[data-testid="acknowledgement-title"]');
expect(refusalAcks.some((t) => /could not be opened/i.test(t)), `the refusal was not reported to the reader: ${JSON.stringify(refusalAcks)}`);
expect(!refusalAcks.some((t) => /Opened in your browser/.test(t)), 'a refused open was reported as a success');
results.refusal = { acknowledgements: refusalAcks, png: refuse.png };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
