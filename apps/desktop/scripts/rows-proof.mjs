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
import { cleanEnvironment } from './lib/harness.mjs';

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
  '[data-testid="acknowledgement"]', '[data-testid="acknowledgement-title"]',
].join(';;');

function launch(name, extra, timeoutMs = 150_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(root, 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES,
      ROTARIS_ROWS_PROOF: '1', ROTARIS_CAPTURE_NET: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
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
const r = launch('rows', {
  ROTARIS_CAPTURE_OPEN_EXTERNAL: 'record',
  // The three activations REQ-CHAT-076 routes: a BARE url in a plain row, an AUTHORED link in a Markdown row,
  // and an image reference naming a location on this machine, which must be refused by its scheme.
  ROTARIS_CAPTURE_CLICKS: [
    `${W} .row--user .md__link@1800`,
    `${W} .md__link[data-href="https://rows-proof.invalid/spec"]@2400`,
    `${W} [data-image-href^="file:"]@3000`,
    `${W} [data-call-key="call-ok"] [data-testid="tool-header"]@3600`,
    `${G} [data-testid="group-header"]@4200`,
    '[data-testid="proof-show-reasoning"]@6000',
    '[data-testid="proof-auto-collapse"]@7000',
    // REQ-CHAT-077: a row taking focus from a pointer, so the arrow keys have a current row to move from. The system
    // row is the one with no activatable child, so the click lands on the row itself and not on something inside it.
    `${W} .row--system@7900`,
  ].join(';;'),
  ROTARIS_CAPTURE_INSPECT_AT: [
    `${W} .row__time@1500`, `${W} .row__attribution@1500`, `${W} .row@1500`, `${W} .row__bar@1500`,
    `${G} [data-testid="group-header"]@5000`, `${G} [data-testid="row-group"]@5000`,
    `${W} [data-call-key="call-blocked"] [data-testid="tool-header"]@5000`,
    `${W} [data-call-key="call-ok"]@7600`,
    `${W} .rowlist@8100`, `${W} .rowlist@8500`,
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
expect(minRowHeight >= 30, `a row was ${minRowHeight} px high, below the 30 px minimum`);
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
const focusedBefore = inspect(r.log, 8100, `${W} .rowlist`)?.active ?? null;
const focusedAfter = inspect(r.log, 8500, `${W} .rowlist`)?.active ?? null;
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
const refuse = launch('refuse', {
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
