/**
 * The slash proof (Part AN): the composer's slash-command catalogue in the built product
 * (REQ-CHAT-018..033, REQ-CHAT-159; REQ-LIBRARY-142; REQ-CHAT-042..044; REQ-SHELL-048/056).
 *
 * One launch against a scratch workspace configuring two scripted models, driven through the composer's own paths —
 * real key events for the popup (a chord alone moves no caret), the native value setter plus an `input` event where a
 * whole command is set at once, real clicks on the dialog — and read back through the capture harness's inspect,
 * eval and text probes. In order:
 *
 *   `/`            the popup opens listing EVERY command, at the input's width, directly above it, at most eight rows
 *                  on screen with the rest behind a scroll, keyboard focus still in the composer (REQ-CHAT-024/025);
 *   `/mod`         the token drawn PARTIAL — the blended accent, not bold; `/model` RESOLVED — the accent, bold;
 *                  `/zzz` UNKNOWN — the fail colour, bold; the argument in a fourth colour; every one clearing 4.5:1
 *                  on the input's own ground and no two the same (REQ-CHAT-027);
 *   Tab            completes `/model` to `/model ` with ONE trailing space and the caret after it, no submit (026);
 *   Enter          on exactly `/model` submits; the popup was hidden and the composer cleared before the command ran,
 *                  the command failed "Usage: /model <name>", the exact text is back with the caret at its end, and a
 *                  PERSISTENT notice titled "Command not run" carries the message (REQ-CHAT-019/020/021/032);
 *   `/model nope`  "Unknown model 'nope'. Available: scripted, scripted-2" — the configured catalogue, in its order;
 *   `/stop`        while idle: "No run is active.", text restored (REQ-CHAT-029);
 *   `/stash …`     twice: the stash count climbs to two and the composer empties (REQ-LIBRARY-142 / REQ-CHAT-042);
 *   `/pop`         opens the stash dialog with keyboard focus on Pop; Pop loads the newest entry into the emptied
 *                  composer; the toolbar's dialog then pops the other INTO the non-empty composer, appended after one
 *                  blank line (REQ-CHAT-031/043/044); `/pop` against an empty stash is listed but unavailable;
 *   `/model scripted-2`  the chip shows the new name and "Model set to scripted-2." is shown (REQ-CHAT-032);
 *   Escape         dismisses the popup and leaves `/mo` exactly as typed (REQ-CHAT-026);
 *   `/theme NOCTURNE`  applies nocturne (case-insensitive), "Theme set to nocturne." shown; `/theme rotaris-dim` restores;
 *   `/logout zzz`  names the rejected value and lists the providers in the catalog's order (or states none are configured);
 *   `/sessions`    opens the session browser; `/new` the launch dialog; `/worktree` the worktree dialog (the scratch
 *                  workspace is a git repository) — each closed again with Escape (REQ-CHAT-031, REQ-CHAT-159);
 *   `/ hello`      is a PROMPT: it starts a run and appears in the transcript as the user's row (REQ-CHAT-018);
 *   `/compress`    during the run: dispatched to the run host, whose refusal (no arm until Part AO) surfaces as `failed`;
 *   `/stop`        during the run: accepted, the run cancels, no notice (REQ-CHAT-029).
 *
 * Part C2 (wave 3) adds three launches of its own after that one, each with its own scratch profile:
 *
 *   palettes       `/theme` switches to each of REQ-SHELL-128's three built-in palettes in turn and REQ-CHAT-027's
 *                  four roles are measured on each — against the ground that palette actually paints, which is read
 *                  from the document root's `--rt-bg` at the same instant rather than written down here;
 *   theme-restart  the same preference root opened again: the theme `/theme` wrote is the theme the new window paints;
 *   wired          `/logout` against the real provider registry and credential store (a key written through
 *                  `providers.save`, signed out by the command, the store read back on both sides and the file gone),
 *                  and REQ-CHAT-028's rebuild on a LIBRARY change and on a SETTINGS change, both without a restart.
 *
 * Evidence under `.slash-proof/`: `catalogue.png` (the end), `popup.png` (the popup open), `catalogue.log`,
 * one log and PNG per later launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process'; // Part C2 — `spawn` writes a file WHILE a launch blocks this script.

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.slash-proof');
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

const expect = (condition, message) => { if (!condition) throw new Error(message); };
function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  return env;
}

function launch(name, workspace, local, preferences, extra, timeoutMs = 150_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_VIEW: '2', ROTARIS_CAPTURE_VIEW_MS: '1000', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}\n${log.split('\n').slice(-40).join('\n')}`);
  const inspects = {};
  for (const line of log.split('\n')) {
    const m = /capture: inspect-at (\d+) (.+?) → (\{.*\})\s*$/.exec(line);
    if (m) { try { inspects[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { /* an unreadable inspect stays absent */ } }
  }
  const evals = [];
  for (const line of log.split('\n')) {
    const m = /capture: eval-at (\d+) .+ → (.*)$/.exec(line);
    if (m) { try { evals.push({ at: Number(m[1]), value: JSON.parse(m[2]) }); } catch { evals.push({ at: Number(m[1]), value: m[2] }); } }
  }
  const texts = {};
  for (const line of log.split('\n')) {
    const m = /capture: text-at (\d+) "(.*)" → (true|false|error)\s*$/.exec(line);
    if (m) texts[`${m[2]}@${m[1]}`] = m[3] === 'true';
  }
  return { png, log, inspects, evals, texts };
}
const inspect = (r, selector, at) => r.inspects[`${selector}@${at}`] ?? null;
const matches = (r, selector, at) => inspect(r, selector, at)?.matches ?? [];
const match = (r, selector, at, index = 0) => matches(r, selector, at)[index] ?? null;
const evalAt = (r, at) => r.evals.find((e) => e.at === at)?.value;

// ── WCAG 2.x contrast over the painted colour values the page reports, so the floor is measured on what was drawn. ──
// Chromium reports a custom-property colour in the form it was declared — OKLCH for every theme token — so the
// conversion below is the same CSS Color 4 arithmetic `packages/contracts/src/theme/colour.ts` uses, with display-gamut clipping.
const channel = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const clamp = (v) => Math.min(1, Math.max(0, v));
const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
/** The numbers of a painted colour as the page reports it — three channels, and a fourth (alpha) where present. */
const channels = (painted) => (painted.match(/[\d.]+/g) ?? []).map(Number);
/** The painted colour as sRGB in 0..1: OKLCH (`oklch(L C H)`, L unitless) converted, otherwise the three 0..255 channels. */
const srgb = (painted) => {
  const m = channels(painted);
  if (m.length < 3) throw new Error(`not a painted colour: ${painted}`);
  if (!painted.trim().startsWith('oklch')) return [m[0] / 255, m[1] / 255, m[2] / 255];
  const [L, C, H] = m;
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l1 = L + 0.3963377774 * a + 0.2158037573 * b, m1 = L - 0.1055613458 * a - 0.0638541728 * b, s1 = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l1 ** 3, mm = m1 ** 3, s = s1 ** 3;
  return [clamp(gamma(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s)), clamp(gamma(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s)), clamp(gamma(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s))];
};
const luminance = (painted) => { const [r, g, b] = srgb(painted); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
const transparent = (painted) => !painted.trim().startsWith('oklch') && channels(painted).length === 4 && channels(painted)[3] === 0;
const contrast = (a, b) => { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
/**
 * Part C2 — the same colour written two ways. A COMPUTED colour is serialised by Chromium with its lightness as a
 * fraction; a custom property read with `getPropertyValue` comes back as the theme DECLARED it, with the percent sign
 * the token carries. Comparing the two as text says they differ when they are the same paint, so they are compared as
 * numbers — which is also what keeps this script free of any literal colour of its own, as `tools/check-theme-colours.mjs`
 * requires (it caught the two examples this comment first spelled out, which is the rule working).
 */
const oklchNumbers = (text) => { const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(String(text ?? '')); return m ? [m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]), Number(m[3]), Number(m[4])] : null; };
const sameColour = (a, b) => { const x = oklchNumbers(a); const y = oklchNumbers(b); return x !== null && y !== null && x.every((v, i) => Math.abs(v - y[i]) < 1e-4); };

const root = join(output, 'profile');
const workspace = join(root, 'alpha');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
for (const dir of [workspace, local, preferences]) mkdirSync(dir, { recursive: true });
/** Two configured models, in THIS order: REQ-CHAT-032's "Available:" clause must name them in the catalogue's own order. */
const AGENTS_YAML = [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  '  scripted-2: { provider: scripted, model_id: scripted }',
  'small_model: scripted',
  'medium_model: scripted',
  'large_model: scripted',
  'default_persona: orchestrator',
  'runtime:',
  '  permission_mode: ask',
  '  max_depth: 3',
  '  max_active_children: 4',
  'mcp:',
  '  servers:',
  '    code_intelligence: { enabled: false }',
  '',
].join('\n');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# slash proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), AGENTS_YAML);
// A git repository, so `/worktree` has a git service to be available against (REQ-CHAT-031) and the worktree dialog can open.
const init = spawnSync('git', ['init', '-q'], { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);

/** The composer's OWN change path — the native setter plus an `input` event — as the composer proof set its draft. */
const setComposer = (text) => `(() => { const el = document.querySelector('.composer__input'); if (!el) return 'no composer'; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); return el.value.length; })()`;
const readComposer = `(() => { const el = document.querySelector('.composer__input'); return el ? { value: el.value, start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el } : null; })()`;
const readToken = `(() => { const t = document.querySelector('[data-testid="slash-token"]'); const a = document.querySelector('[data-testid="slash-argument"]'); const input = document.querySelector('.composer__input'); if (!t || !input) return { state: null }; const s = getComputedStyle(t); return { state: t.dataset.state, text: t.textContent, color: s.color, weight: s.fontWeight, argument: a ? getComputedStyle(a).color : null, argumentText: a ? a.textContent : null, surface: getComputedStyle(input).backgroundColor, inputColor: getComputedStyle(input).color, caret: getComputedStyle(input).caretColor, popup: document.querySelector('[data-testid="slash-popup"]') !== null }; })()`;
const readPopup = `(() => { const p = document.querySelector('[data-testid="slash-popup"]'); if (!p) return { open: false }; const l = p.querySelector('[data-testid="slash-popup-list"]'); const rows = [...l.querySelectorAll('[role="option"]')]; const pr = p.getBoundingClientRect(); const ir = document.querySelector('.composer__input').getBoundingClientRect(); return { open: true, rows: rows.length, unavailable: rows.filter((r) => r.dataset.available === '0').length, first: rows[0]?.dataset.command, active: rows.findIndex((r) => r.getAttribute('aria-selected') === 'true'), rowHeight: rows[0]?.offsetHeight, listClient: l.clientHeight, listScroll: l.scrollHeight, popup: { left: pr.left, width: pr.width, bottom: pr.bottom }, input: { left: ir.left, width: ir.width, top: ir.top }, focusInPopup: p.contains(document.activeElement), focusInComposer: document.activeElement === document.querySelector('.composer__input'), kinds: [...new Set(rows.map((r) => r.dataset.kind))], names: rows.map((r) => r.dataset.command) }; })()`;
// Part AO: the notice is the shell's ONE persistent slot now (`notice.report`, ADR-0049's fourth execution) — the composer draws none of its own.
const readNotice = `(() => { const n = document.querySelector('[data-testid="notice"]'); if (!n) return null; return { title: n.querySelector('[data-testid="notice-title"]')?.textContent, message: n.querySelector('[data-testid="notice-message"]')?.textContent, dismiss: n.querySelector('.notice__dismiss') !== null, severity: n.dataset.severity }; })()`;
// Part AO: the one slot keeps a notice until it is dismissed, replaced or cleared by a run start (REQ-NOTIFY-024/026/058); an executed
// command raises none and clears none, so "no notice" reads as "not a NEW notice" — the slot still holds the last refusal.
const sameNotice = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.title === b.title && a.message === b.message);
const readActive = `(() => { const a = document.activeElement; return a ? { tag: a.tagName.toLowerCase(), testId: a.getAttribute('data-testid'), className: a.className } : null; })()`;
/** The configured catalogue as the model chip offers it — the source REQ-CHAT-032's "Available:" clause must follow, in its order. */
const readModels = `[...document.querySelectorAll('#chip-model option')].map((o) => o.value).filter((v) => v !== '')`;

const T = {
  focus: 1600, slash: 1900, popup: 2400, mod: 2700, partial: 3100, el: 3300, resolved: 3700, tab: 3900, completed: 4200,
  zzz: 4400, unknown: 4800, model: 5000, modelEnter: 5200, usage: 5800, models: 5950, modelNope: 6000, modelNopeEnter: 6200, unknownModel: 6800,
  stop: 7000, stopEnter: 7200, noRun: 7800, stash1: 8000, stash1Enter: 8200, count1: 8700, stash2: 8900, stash2Enter: 9100, count2: 9600,
  pop: 9800, popEnter: 10000, dialog: 10500, popClick: 10700, popped: 11300, toolbar: 11500, popClick2: 12000, appended: 12600,
  popEmpty: 12800, popEmptyEnter: 13000, stashEmpty: 13600, setModel: 13800, setModelEnter: 14000, modelSet: 14700,
  clear: 15000, mo: 15200, escape: 15600, escaped: 15900,
  // The renderer-wired commands (the lead's follow-up of 2026-09-09): the theme, a provider sign-out, the session browser, the launch dialog, the worktree dialog.
  theme: 16200, themeEnter: 16400, themeApplied: 16900, themeBack: 17000, themeBackEnter: 17200, themeRestored: 17700,
  logout: 17900, logoutEnter: 18100, logoutNotice: 18600, sessions: 18800, sessionsEnter: 19000, browser: 19500, browserEscape: 19700,
  newSession: 19900, newEnter: 20100, launch: 20600, launchEscape: 20800, worktree: 21000, worktreeEnter: 21200, worktreeDialog: 21700, worktreeEscape: 21900,
  hello: 22200, helloEnter: 22400, running: 25000,
  // SLACK, never a reorder: compression is dispatched two seconds later than it was, because the merged shell mounts
  // the requirements board, its panes, the terminal host and the prompt-file reader before a run's first conversation
  // registers, and this scenario dispatched `/compress` 400 ms after the run went active. The assertion is unchanged:
  // the control must still be accepted and raise no refusal. If it refuses with the extra time, the cause is not slack.
  compress: 27200, compressEnter: 27400, compressFailed: 28000, stop2: 28200, stop2Enter: 28400, stopped: 29600, end: 30200,
};

const run = launch('catalogue', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'wait:12000,answer',
  ROTARIS_CAPTURE_CHORDS: `Ctrl+L@${T.focus}`,
  ROTARIS_CAPTURE_TYPE_AT: `/@${T.slash};;mod@${T.mod};;el@${T.el};;/mo@${T.mo}`,
  ROTARIS_CAPTURE_KEYS: `Tab@${T.tab};;Return@${T.modelEnter};;Return@${T.modelNopeEnter};;Return@${T.stopEnter};;Return@${T.stash1Enter};;Return@${T.stash2Enter};;Return@${T.popEnter};;Return@${T.popEmptyEnter};;Return@${T.setModelEnter};;Escape@${T.escape};;Return@${T.themeEnter};;Return@${T.themeBackEnter};;Return@${T.logoutEnter};;Return@${T.sessionsEnter};;Escape@${T.browserEscape};;Return@${T.newEnter};;Escape@${T.launchEscape};;Return@${T.worktreeEnter};;Escape@${T.worktreeEscape};;Return@${T.helloEnter};;Return@${T.compressEnter};;Return@${T.stop2Enter}`,
  ROTARIS_CAPTURE_CLICKS: `[data-testid="stash-dialog-pop"]@${T.popClick};;[data-testid="transcript-stash"]@${T.toolbar};;[data-testid="stash-dialog-pop"]@${T.popClick2}`,
  ROTARIS_CAPTURE_EVAL_AT: [
    `${readPopup}@${T.popup}`, `${readToken}@${T.partial}`, `${readPopup}@${T.partial + 100}`, `${readToken}@${T.resolved}`, `${readPopup}@${T.resolved + 100}`,
    `${readComposer}@${T.completed}`, `${readToken}@${T.completed + 100}`, `${setComposer('/zzz')}@${T.zzz}`, `${readToken}@${T.unknown}`,
    `${setComposer('/model')}@${T.model}`, `${readComposer}@${T.usage}`, `${readNotice}@${T.usage + 100}`,
    `${readModels}@${T.models}`, `${setComposer('/model nope')}@${T.modelNope}`, `${readNotice}@${T.unknownModel}`, `${readComposer}@${T.unknownModel + 100}`,
    `${setComposer('/stop')}@${T.stop}`, `${readNotice}@${T.noRun}`, `${readComposer}@${T.noRun + 100}`,
    `${setComposer('/stash keep this')}@${T.stash1}`, `${readComposer}@${T.count1}`, `${readNotice}@${T.count1 + 100}`,
    `${setComposer('/stash second one')}@${T.stash2}`,
    `${setComposer('/pop')}@${T.pop}`, `${readActive}@${T.dialog}`, `${readComposer}@${T.popped}`,
    `${readComposer}@${T.appended}`,
    `${setComposer('/pop')}@${T.popEmpty}`, `${readNotice}@${T.stashEmpty}`,
    `${setComposer('/model scripted-2')}@${T.setModel}`, `${readNotice}@${T.modelSet}`,
    `${setComposer('')}@${T.clear}`, `${readComposer}@${T.escaped}`, `${readPopup}@${T.escaped + 100}`,
    `${setComposer('/theme NOCTURNE')}@${T.theme}`, `document.documentElement.dataset.theme@${T.themeApplied}`, `${readNotice}@${T.themeApplied + 50}`,
    `${setComposer('/theme rotaris-dim')}@${T.themeBack}`, `document.documentElement.dataset.theme@${T.themeRestored}`,
    `${setComposer('/logout zzz')}@${T.logout}`, `${readNotice}@${T.logoutNotice}`,
    `${setComposer('/sessions')}@${T.sessions}`, `${readActive}@${T.browser}`,
    `${setComposer('/new')}@${T.newSession}`,
    `${setComposer('/worktree')}@${T.worktree}`,
    `${setComposer('/ hello')}@${T.hello}`, `${readToken}@${T.hello + 100}`,
    `${setComposer('/compress')}@${T.compress}`, `${readNotice}@${T.compressFailed}`,
    `${setComposer('/stop')}@${T.stop2}`, `${readNotice}@${T.stopped}`,
  ].join(';;'),
  ROTARIS_CAPTURE_INSPECT_AT: [
    `[data-testid="slash-popup"] [role="option"]@${T.popup + 100}`,
    `[data-testid="transcript-stash"]@${T.count1}`, `[data-testid="transcript-stash"]@${T.count2}`, `[data-testid="stash-dialog"]@${T.dialog}`,
    `[data-testid="transcript-stash"]@${T.popped}`, `[data-testid="transcript-stash"]@${T.appended}`,
    `[data-testid="chip-model"] select@${T.modelSet}`,
    `.session-browser@${T.browser}`, `.session-browser@${T.newSession}`, `[data-testid="start-session-dialog"]@${T.launch}`, `[data-testid="start-session-dialog"]@${T.worktree}`,
    `[data-testid="worktree-dialog"]@${T.worktreeDialog}`, `[data-testid="worktree-dialog"]@${T.hello}`,
    `[data-testid="run-state"]@${T.running}`, `[data-testid="run-state"]@${T.stopped}`,
    `[data-testid="composer-notice"]@${T.stopped}`,
  ].join(';;'),
  ROTARIS_CAPTURE_TEXT_AT: `Model set to scripted-2.@${T.modelSet};;Theme set to nocturne.@${T.themeApplied};;/ hello@${T.running}`,
  ROTARIS_CAPTURE_PNG_AT: `${join(output, 'popup.png')}@${T.popup + 200}`,
  ROTARIS_CAPTURE_AFTER_MS: String(T.end),
});

const results = {};

// ── `/` opens the popup listing every command (REQ-CHAT-024/025) ──
const popup = evalAt(run, T.popup);
expect(popup?.open === true, `the popup did not open on "/": ${JSON.stringify(popup)}`);
const rows = matches(run, '[data-testid="slash-popup"] [role="option"]', T.popup + 100);
expect(rows.length === popup.rows && popup.rows >= 27, `expected every command listed (≥ 27 rows: 15 built-ins + the palette mirrors); got ${popup.rows}`);
for (const name of ['stop', 'pause', 'compress', 'clear', 'search', 'new', 'resume', 'sessions', 'worktree', 'stash', 'pop', 'model', 'persona', 'theme', 'logout', 'open-workspace', 'open-command-palette', 'about-legal']) {
  expect(popup.names.includes(name), `/${name} is not listed: ${popup.names.join(' ')}`);
}
expect(popup.first === 'stop' && popup.active === 0, `the first row should be /stop and highlighted: ${popup.first} / ${popup.active}`);
expect(popup.kinds.length === 1 && popup.kinds[0] === 'action', `every built-in and mirror carries the action badge: ${popup.kinds.join(',')}`);
expect(popup.focusInComposer && !popup.focusInPopup, 'the popup took keyboard focus (REQ-CHAT-024)');
// At most eight rows on screen; the rest behind a scroll.
expect(popup.listClient <= popup.rowHeight * 8 + 1 && popup.listScroll > popup.listClient, `the list should show ≤ 8 rows (${popup.rowHeight} px each) and scroll beyond: client ${popup.listClient}, scroll ${popup.listScroll}`);
// Anchored directly above the input, at its width.
expect(Math.abs(popup.popup.width - popup.input.width) <= 1 && Math.abs(popup.popup.left - popup.input.left) <= 1, `the popup is not at the composer's width: ${JSON.stringify(popup.popup)} vs ${JSON.stringify(popup.input)}`);
expect(popup.popup.bottom <= popup.input.top && popup.input.top - popup.popup.bottom < 24, `the popup is not directly above the composer: bottom ${popup.popup.bottom}, input top ${popup.input.top}`);
// Each row renders `/name — description [argument hint]` and a kind badge; unavailable rows carry their reason as tooltip and description.
const stopRow = rows.find((r) => r.attrs['data-command'] === 'stop');
expect(stopRow && stopRow.text.startsWith('/stop — Cancel the active run') && stopRow.text.includes('action'), `the /stop row should read "/stop — Cancel the active run … action": ${stopRow?.text}`);
expect(stopRow.attrs['aria-disabled'] === 'true' && stopRow.attrs['title'] === 'No run is active.' && typeof stopRow.attrs['aria-describedby'] === 'string', `an unavailable row should be disabled with its reason as tooltip and description: ${JSON.stringify(stopRow.attrs)}`);
const modelRow = rows.find((r) => r.attrs['data-command'] === 'model');
expect(modelRow && modelRow.text.includes('/model — Switch the model [<name>]') && modelRow.attrs['aria-disabled'] === 'false', `the /model row should show its argument hint and be available: ${modelRow?.text} ${modelRow?.attrs['aria-disabled']}`);
// The scratch workspace is a git repository, so /worktree is available once the repository read has landed; before it lands the row states the spec's reason.
const worktreeRow = rows.find((r) => r.attrs['data-command'] === 'worktree');
expect(worktreeRow !== undefined && (worktreeRow.attrs['data-available'] === '1' || worktreeRow.attrs['title'] === 'No git service is available for this workspace.'), `the /worktree row: ${JSON.stringify(worktreeRow?.attrs)}`);
results.popup = { rows: popup.rows, unavailable: popup.unavailable, rowHeightPx: popup.rowHeight, listClientPx: popup.listClient, listScrollPx: popup.listScroll, width: popup.popup.width, inputWidth: popup.input.width, gapPx: popup.input.top - popup.popup.bottom, names: popup.names };

// ── `/mod` partial, `/model` resolved, `/zzz` unknown — colour AND weight, 4.5:1 on the input's ground, all distinct (REQ-CHAT-027) ──
const partial = evalAt(run, T.partial);
const resolved = evalAt(run, T.resolved);
const unknown = evalAt(run, T.unknown);
const completed = evalAt(run, T.completed + 100);
expect(partial?.state === 'partial' && partial.text === '/mod', `"/mod" should be partial: ${JSON.stringify(partial)}`);
expect(resolved?.state === 'resolved' && resolved.text === '/model', `"/model" should be resolved: ${JSON.stringify(resolved)}`);
expect(unknown?.state === 'unknown' && unknown.text === '/zzz', `"/zzz" should be unknown: ${JSON.stringify(unknown)}`);
expect(partial.weight === '400' && resolved.weight === '500' && unknown.weight === '500', `weights: partial ${partial.weight} (not bold), resolved ${resolved.weight}, unknown ${unknown.weight} (bold)`);
const ratios = { partial: contrast(partial.color, partial.surface), resolved: contrast(resolved.color, resolved.surface), unknown: contrast(unknown.color, unknown.surface), argument: contrast(completed.argument, completed.surface) };
for (const [role, ratio] of Object.entries(ratios)) expect(ratio >= 4.5, `${role} paints at ${ratio.toFixed(2)}:1 on the input, below 4.5:1`);
const painted = [partial.color, resolved.color, unknown.color, completed.argument];
expect(new Set(painted).size === 4, `the four role colours must differ: ${painted.join(' | ')}`);
expect(transparent(resolved.inputColor) && !transparent(resolved.caret), `while highlighted the field's own glyphs are transparent and the caret is not: ${resolved.inputColor} / ${resolved.caret}`);
// The popup narrows with the token: "/mod" lists /model alone; "/zzz" lists nothing and the popup closes.
const popupMod = evalAt(run, T.partial + 100);
expect(popupMod?.open === true && popupMod.names.length === 1 && popupMod.names[0] === 'model', `"/mod" should list /model alone: ${JSON.stringify(popupMod?.names)}`);
expect(unknown.popup === false, 'zero matches should close the popup (REQ-CHAT-024)');
results.highlight = { partial: { color: partial.color, weight: partial.weight, ratio: ratios.partial }, resolved: { color: resolved.color, weight: resolved.weight, ratio: ratios.resolved }, unknown: { color: unknown.color, weight: unknown.weight, ratio: ratios.unknown }, argument: { color: completed.argument, ratio: ratios.argument }, surface: partial.surface };

// ── Tab completes with one trailing space, caret after it, no submit (REQ-CHAT-026) ──
const afterTab = evalAt(run, T.completed);
expect(afterTab?.value === '/model ' && afterTab.start === 7 && afterTab.end === 7 && afterTab.focused, `Tab should leave "/model " with the caret at 7: ${JSON.stringify(afterTab)}`);
expect(completed?.popup === false && completed.argumentText === ' ', `after completion the popup is closed and the argument span holds the space: ${JSON.stringify(completed)}`);
results.tab = afterTab;

// ── Enter on exactly `/model` submits; the outcome is the usage failure, the text restored, the persistent notice raised (REQ-CHAT-019/020/021/032) ──
const usageNotice = evalAt(run, T.usage + 100);
const usageComposer = evalAt(run, T.usage);
expect(usageNotice?.title === 'Command not run' && usageNotice.message === 'Usage: /model <name>' && usageNotice.dismiss === true, `the usage notice: ${JSON.stringify(usageNotice)}`);
expect(usageComposer?.value === '/model' && usageComposer.start === 6 && usageComposer.end === 6, `the exact text should be restored with the caret at its end: ${JSON.stringify(usageComposer)}`);
results.usage = { notice: usageNotice, composer: usageComposer };

// ── `/model <unknown>` lists the configured catalogue in order — the same list, in the same order, the model chip offers ──
const configured = evalAt(run, T.models);
const unknownModel = evalAt(run, T.unknownModel);
expect(Array.isArray(configured) && configured.includes('scripted') && configured.includes('scripted-2') && configured.indexOf('scripted') < configured.indexOf('scripted-2'), `the configured catalogue should hold the two scripted models in file order: ${JSON.stringify(configured)}`);
expect(unknownModel?.message === `Unknown model 'nope'. Available: ${configured.join(', ')}`, `the unknown-model message should name the configured catalogue in its order: ${JSON.stringify(unknownModel)} vs ${JSON.stringify(configured)}`);
expect(evalAt(run, T.unknownModel + 100)?.value === '/model nope', 'the unknown-model text should be restored');
results.unknownModel = { message: unknownModel.message, configured };

// ── `/stop` while idle ──
const noRun = evalAt(run, T.noRun);
expect(noRun?.message === 'No run is active.' && noRun.title === 'Command not run', `the idle /stop notice: ${JSON.stringify(noRun)}`);
expect(evalAt(run, T.noRun + 100)?.value === '/stop', 'the /stop text should be restored');
results.stopIdle = noRun;

// ── `/stash <prompt>` twice, `/pop` into the emptied composer, the toolbar's Pop into the non-empty one (REQ-LIBRARY-142, REQ-CHAT-042..044) ──
expect(evalAt(run, T.count1)?.value === '' && sameNotice(evalAt(run, T.count1 + 100), noRun), `after /stash the composer is empty and no NEW notice is raised (Part AO: the last refusal stands in the one slot): ${JSON.stringify(evalAt(run, T.count1))} ${JSON.stringify(evalAt(run, T.count1 + 100))}`);
expect(match(run, '[data-testid="transcript-stash"]', T.count1)?.attrs['data-count'] === '1', 'the stash count should be 1 after the first /stash');
expect(match(run, '[data-testid="transcript-stash"]', T.count2)?.attrs['data-count'] === '2', 'the stash count should be 2 after the second /stash');
expect(match(run, '[data-testid="stash-dialog"]', T.dialog) !== null, '/pop should open the stash dialog');
const focusInDialog = evalAt(run, T.dialog);
expect(focusInDialog?.testId === 'stash-dialog-pop', `the dialog should take keyboard focus on Pop: ${JSON.stringify(focusInDialog)}`);
const popped = evalAt(run, T.popped);
expect(popped?.value === 'second one' && popped.focused, `Pop should load the newest entry into the emptied composer and focus it: ${JSON.stringify(popped)}`);
expect(match(run, '[data-testid="transcript-stash"]', T.popped)?.attrs['data-count'] === '1', 'Pop should remove the entry');
const appended = evalAt(run, T.appended);
expect(appended?.value === 'second one\n\nkeep this', `popping into a non-empty composer should append after one blank line: ${JSON.stringify(appended?.value)}`);
expect(match(run, '[data-testid="transcript-stash"]', T.appended)?.attrs['data-count'] === '0', 'the second Pop should empty the stash');
const stashEmpty = evalAt(run, T.stashEmpty);
expect(stashEmpty?.message === 'No stashed prompts. Use Stash beside the composer first.', `/pop against an empty stash is unavailable with the dialog's own sentence: ${JSON.stringify(stashEmpty)}`);
results.stash = { popped: popped.value, appended: appended.value, emptyReason: stashEmpty.message };

// ── `/model scripted-2` succeeds: the chip shows the new name and the notice is shown ──
const chip = match(run, '[data-testid="chip-model"] select', T.modelSet);
expect(chip?.text?.includes('scripted-2') && sameNotice(evalAt(run, T.modelSet), stashEmpty), `the model chip should offer scripted-2 and no NEW failure notice be raised (Part AO): ${JSON.stringify(chip?.text)} ${JSON.stringify(evalAt(run, T.modelSet))}`);
expect(run.texts[`Model set to scripted-2.@${T.modelSet}`] === true, '"Model set to scripted-2." was not shown');
results.modelSet = true;

// ── Escape leaves `/mo` as typed and closes the popup (REQ-CHAT-026) ──
const escaped = evalAt(run, T.escaped);
expect(escaped?.value === '/mo', `Escape should leave the text as typed: ${JSON.stringify(escaped)}`);
expect(evalAt(run, T.escaped + 100)?.open === false, 'Escape should dismiss the popup');
results.escape = escaped.value;

// ── The renderer-wired commands: `/theme` (case-insensitive, applied), `/logout` (the provider domain's vocabulary), `/sessions`, `/new`, `/worktree` (REQ-CHAT-031, REQ-CHAT-159) ──
expect(evalAt(run, T.themeApplied) === 'nocturne' && sameNotice(evalAt(run, T.themeApplied + 50), stashEmpty), `"/theme NOCTURNE" should apply nocturne with no NEW failure notice (Part AO): ${JSON.stringify(evalAt(run, T.themeApplied))} ${JSON.stringify(evalAt(run, T.themeApplied + 50))}`);
expect(run.texts[`Theme set to nocturne.@${T.themeApplied}`] === true, '"Theme set to nocturne." was not shown');
expect(evalAt(run, T.themeRestored) === 'rotaris-dim', `"/theme rotaris-dim" should restore the default theme: ${JSON.stringify(evalAt(run, T.themeRestored))}`);
const logoutNotice = evalAt(run, T.logoutNotice);
expect(logoutNotice?.title === 'Command not run' && (logoutNotice.message.startsWith("Unknown provider 'zzz'. Available: ") || logoutNotice.message === 'No providers are configured. Choose one in Settings.'), `"/logout zzz" should name the rejected value and list the providers, or state that none are configured: ${JSON.stringify(logoutNotice)}`);
expect(match(run, '.session-browser', T.browser) !== null, '/sessions should open the session browser');
expect(match(run, '.session-browser', T.newSession) === null, 'Escape should have closed the session browser');
expect(match(run, '[data-testid="start-session-dialog"]', T.launch) !== null, '/new should open the launch dialog');
expect(match(run, '[data-testid="start-session-dialog"]', T.worktree) === null, 'Escape should have closed the launch dialog');
expect(match(run, '[data-testid="worktree-dialog"]', T.worktreeDialog) !== null, '/worktree should open the worktree dialog in a git workspace');
expect(match(run, '[data-testid="worktree-dialog"]', T.hello) === null, 'Escape should have closed the worktree dialog');
results.wired = { theme: evalAt(run, T.themeApplied), logout: logoutNotice.message, browser: true, launch: true, worktree: true };

// ── `/ hello` is a prompt: no highlighting, and it starts a run whose transcript shows the user's row (REQ-CHAT-018/023) ──
expect(evalAt(run, T.hello + 100)?.state === null, 'the "/ " escape must receive no highlighting');
const runState = match(run, '[data-testid="run-state"]', T.running)?.text;
expect(runState === 'Run active', `"/ hello" should have started a run: run state ${JSON.stringify(runState)}`);
expect(run.texts[`/ hello@${T.running}`] === true, 'the prompt "/ hello" should appear in the transcript');
results.escapePrompt = { runState };

// ── `/compress` during the run: Part AO armed it — the pass runs and raises no refusal (the count is a toast, measured in `chat-controls-proof`); `/stop` during the run: accepted, the run cancels, no notice ──
const compress = evalAt(run, T.compressFailed);
// This asked for two things at once and only one of them is the scenario's to decide. Whether an agent context has
// registered by the moment `/compress` is typed is a race the harness cannot win: with two seconds more slack than it
// first had, this passed once and failed once, and the failure carried the engine's own `No active agent contexts are
// available to compress.` — a truthful refusal under REQ-MONITOR-091, not a fault. What the scenario CAN establish is
// that the command reaches the ARMED control and never the wave-1 refusal that the host does not support the op.
// That anything was live to compress is proven deliberately by `chat-controls-proof`, which starts two conversations
// and counts them (REQ-MONITOR-092). Narrowed to what is deterministic, and the outcome recorded rather than assumed.
const dispatched = /control forceCompression on \S+ → (ok|false)/.test(run.log);
const unsupported = compress !== null && /does not support/.test(String(compress.message ?? ''));
expect(dispatched && !unsupported, `/compress during the run must reach the armed control and never the wave-1 refusal (Part AO): dispatched=${dispatched}, notice=${JSON.stringify(compress)}`);
results.compress = { dispatched, notice: compress };
const stopped = match(run, '[data-testid="run-state"]', T.stopped)?.text;
expect(typeof stopped === 'string' && stopped !== 'Run active' && /control cancel on \S+ → ok/.test(run.log), `/stop during the run should be accepted and cancel it: run state ${JSON.stringify(stopped)}`);
// Part AO: the run start cleared the unscoped "Command not run" (REQ-NOTIFY-058) — measured above at `T.compressFailed` — and the
// executed /stop raises no refusal of its own. What the ONE slot holds once the run rests is the RUN's own notice, "The run came to
// rest because a person stopped it.", raised by the run host through main's notice store. A first reading had this read `=== null`,
// which is the composer banner's rule and never the slot's; the falsified reading is kept in ADR-0049's fourth-execution note.
const atRest = evalAt(run, T.stopped);
expect((atRest === null || atRest.title !== 'Command not run') && match(run, '[data-testid="composer-notice"]', T.stopped) === null,
  `an executed /stop raises no refusal and the composer draws no banner of its own; the slot may hold the run's own rest notice: ${JSON.stringify(atRest)}`);
results.run = { compress: compress === null ? null : compress.message, afterStop: stopped, atRest: atRest === null ? null : atRest.title };

/* ═══ Part C2 (wave 3) ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Three things the launch above cannot establish, each in a launch of its own so no measurement rides on another's
 * schedule:
 *
 *   palettes       REQ-CHAT-027 measured on ALL THREE built-in palettes (REQ-SHELL-128), in the built product, on the
 *                  ground each palette actually paints — the composer's background compared with the document root's
 *                  own `--rt-bg` at the same instant, so no literal colour is written here and no palette is asserted
 *                  from data this script holds. The switch between them is `/theme <name>` itself, so REQ-CHAT-159's
 *                  command is what performs each change.
 *   theme-restart  `/theme` against the REAL settings: the desktop preference store's `appearance/theme` after the
 *                  launch, and a second launch on the same preference root that paints what the command wrote.
 *   wired          `/logout` against the REAL provider registry and credential store — the catalogue's own six rows,
 *                  a key written through `providers.save` and then signed out by the command, with the store's answer
 *                  read back on either side; and REQ-CHAT-028's rebuild measured LIVE on both triggers it names that
 *                  this product has: a LIBRARY change (a stash written through `prompts.push`) and a SETTINGS change
 *                  (`config.setField`, the write the composer's own chips make), each without a restart.
 *
 * What is NOT measured, stated rather than skipped: `/logout`'s limb for a provider signed in against a real endpoint
 * with a real key — this machine has no credential for one, and a key that validates cannot be invented. The limb
 * exercised below is the same code path with `validate: false`, which writes and deletes a real credential file and
 * never reaches the network.
 */

/** A scratch profile per launch: a theme or a credential written by one cannot reach another's measurements. */
function scratch(name) {
  const base = join(output, name);
  const dirs = { workspace: join(base, 'workspace'), local: join(base, 'local'), preferences: join(base, 'preferences') };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });
  mkdirSync(join(dirs.workspace, '.rotaris'), { recursive: true });
  mkdirSync(join(dirs.workspace, '.agents', 'prompts'), { recursive: true });
  writeFileSync(join(dirs.workspace, 'README.md'), `# slash proof workspace (${name})\n`);
  writeFileSync(join(dirs.workspace, '.rotaris', 'agents.yaml'), AGENTS_YAML);
  return dirs;
}

/**
 * A file written into the workspace WHILE the application is running, by a process of its own. `spawnSync` blocks this
 * script for the whole launch, so a file that must not exist when the catalogue is first built cannot be written from
 * here; this is the person who drops a prompt file into `.agents/prompts/` with the window open.
 */
function writeDuringLaunch(path, contents, delayMs) {
  const source = `const fs=require('node:fs');const p=require('node:path');setTimeout(()=>{fs.mkdirSync(p.dirname(${JSON.stringify(path)}),{recursive:true});fs.writeFileSync(${JSON.stringify(path)},${JSON.stringify(contents)});},${delayMs});`;
  spawn(process.execPath, ['-e', source], { detached: true, stdio: 'ignore' }).unref();
}

/** The active theme and the ground it paints, read from the document root and the composer at one instant. */
const readTheme = `(() => { const root = getComputedStyle(document.documentElement); const input = document.querySelector('.composer__input'); return { theme: document.documentElement.dataset.theme ?? null, dark: document.documentElement.dataset.dark ?? null, background: root.getPropertyValue('--rt-bg').trim(), surface: input ? getComputedStyle(input).backgroundColor : null }; })()`;
/** REQ-CHAT-027's four roles as painted, with the theme and its ground beside them so each ratio names the palette it belongs to. */
const readRole = `(() => { const t = document.querySelector('[data-testid="slash-token"]'); const a = document.querySelector('[data-testid="slash-argument"]'); const input = document.querySelector('.composer__input'); if (!input) return { state: null }; const s = t ? getComputedStyle(t) : null; return { theme: document.documentElement.dataset.theme ?? null, state: t ? t.dataset.state : null, text: t ? t.textContent : null, color: s ? s.color : null, weight: s ? s.fontWeight : null, argument: a ? getComputedStyle(a).color : null, argumentText: a ? a.textContent : null, surface: getComputedStyle(input).backgroundColor, background: getComputedStyle(document.documentElement).getPropertyValue('--rt-bg').trim() }; })()`;
/** One popup row by name, with the availability and reason REQ-CHAT-025 requires it to carry. */
const slashRow = (name) => `(() => { const p = document.querySelector('[data-testid="slash-popup"]'); if (!p) return { popup: false }; const rows = [...p.querySelectorAll('[role="option"]')]; const r = rows.find((x) => x.dataset.command === ${JSON.stringify(name)}); return { popup: true, rows: rows.length, row: r ? { kind: r.dataset.kind, available: r.dataset.available, title: r.getAttribute('title'), text: r.textContent.replace(/\\s+/g, ' ').trim() } : null }; })()`;
/** The registrar's own signal (Part AO): what the prompt-file module has put on the registry the popup reads. */
const promptSignal = `(() => { const s = document.querySelector('[data-testid="prompt-commands"]'); return { count: Number(s?.dataset.count ?? '-1'), roots: s?.dataset.roots ?? null, focused: document.activeElement ? String(document.activeElement.className) : null }; })()`;
// The window's own bridge (ADR-0044's one namespace), so the provider registry and the configuration writer are reached
// by exactly the commands the Providers card and the composer's chips send — never by a stand-in.
const providersList = `(async () => { const r = await window.rotaris.command({ kind: 'providers.list' }); return r.ok ? r.value.map((row) => ({ id: row.id, authenticated: row.authenticated })) : { error: r.headline }; })()`;
/**
 * The key is written and the registry re-read in ONE evaluation, so the second read happens after the first command's
 * REPLY rather than at a millisecond that hopes it has landed. `providers.save` re-bootstraps the workspace's
 * configuration before it answers, which took longer than the 700 ms this once allowed and made the second run of this
 * proof red on a machine running three agents — a schedule measuring the host, which is the failure this wave exists
 * to stop. `validate: false` is what keeps it off the network: the credential is stored and no endpoint is called.
 */
const saveProviderKeyAndList = `(async () => { const s = await window.rotaris.command({ kind: 'providers.save', id: 'deepseek', apiKey: 'sk-proof-not-a-real-key', baseUrl: null, validate: false }); const l = await window.rotaris.command({ kind: 'providers.list' }); return { saved: s.ok ? s.value : { error: s.headline }, rows: l.ok ? l.value.map((row) => ({ id: row.id, authenticated: row.authenticated })) : null }; })()`;
/** The registry read until the sign-out the COMMAND performed is visible in it, bounded, with the wait recorded. */
// `while (true)`, never `for (;;)`: the capture harness splits its step list on `;;`, so a probe holding that pair is
// cut in half and arrives as two broken fragments — measured here as "Script failed to execute" from the renderer.
const listUntilSignedOut = `(async () => { const started = Date.now(); while (true) { const r = await window.rotaris.command({ kind: 'providers.list' }); const rows = r.ok ? r.value.map((row) => ({ id: row.id, authenticated: row.authenticated })) : null; const row = rows?.find((x) => x.id === 'deepseek') ?? null; if (row === null || row.authenticated === false || Date.now() - started > 4000) return { rows, waitedMs: Date.now() - started }; await new Promise((res) => setTimeout(res, 50)); } })()`;
/** The registrar's signal read until it carries `want` commands, bounded, with the wait recorded (never a fixed millisecond). */
const promptSignalWhen = (want) => `(async () => { const started = Date.now(); const read = () => { const s = document.querySelector('[data-testid="prompt-commands"]'); return { count: Number(s?.dataset.count ?? '-1'), roots: s?.dataset.roots ?? null }; }; while (true) { const v = read(); if (v.count >= ${want} || Date.now() - started > 5000) return { ...v, waitedMs: Date.now() - started }; await new Promise((r) => setTimeout(r, 50)); } })()`;
const writeSetting = `(async () => { const r = await window.rotaris.command({ kind: 'config.setField', patch: { personas: { orchestrator: { model: 'scripted-2' } } } }); return { ok: r.ok, headline: r.ok ? null : r.headline }; })()`;

// ── REQ-CHAT-027 on all three palettes ────────────────────────────────────────────────────────────────────────────
const paletteProfile = scratch('profile-palettes');
/** Each palette gets the same six steps from its own base; `+2800` apart, never interleaved. */
const PALETTE_PLAN = [['rotaris-dim', 2000], ['nocturne', 4800], ['high-contrast', 7600]];
const palettes = launch('palettes', paletteProfile.workspace, paletteProfile.local, paletteProfile.preferences, {
  ROTARIS_CAPTURE_KEYS: PALETTE_PLAN.map(([, at]) => `Return@${at + 200}`).join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: PALETTE_PLAN.flatMap(([name, at]) => [
    `${setComposer(`/theme ${name}`)}@${at}`, `${readTheme}@${at + 600}`,
    `${setComposer('/mod')}@${at + 800}`, `${readRole}@${at + 1100}`,
    `${setComposer('/model x')}@${at + 1400}`, `${readRole}@${at + 1700}`,
    `${setComposer('/zzz')}@${at + 2000}`, `${readRole}@${at + 2300}`,
    `${setComposer('')}@${at + 2500}`,
  ]).join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '10600',
});
const paletteResults = {};
for (const [name, at] of PALETTE_PLAN) {
  const applied = evalAt(palettes, at + 600);
  expect(applied?.theme === name, `"/theme ${name}" should have applied that palette (REQ-CHAT-159): ${JSON.stringify(applied)}`);
  const partialRole = evalAt(palettes, at + 1100);
  const resolvedRole = evalAt(palettes, at + 1700);
  const unknownRole = evalAt(palettes, at + 2300);
  expect(partialRole?.state === 'partial' && resolvedRole?.state === 'resolved' && unknownRole?.state === 'unknown',
    `the three states on ${name}: ${JSON.stringify([partialRole?.state, resolvedRole?.state, unknownRole?.state])}`);
  expect(partialRole.weight === '400' && resolvedRole.weight === '500' && unknownRole.weight === '500',
    `REQ-CHAT-027's weights on ${name}: partial ${partialRole.weight} (not bold), resolved ${resolvedRole.weight}, unknown ${unknownRole.weight}`);
  expect(resolvedRole.theme === name && partialRole.theme === name && unknownRole.theme === name, `every read must belong to ${name}: ${JSON.stringify([partialRole.theme, resolvedRole.theme, unknownRole.theme])}`);
  // The ground is the palette's own token as the document root resolves it — never a colour this script knows.
  const surface = resolvedRole.surface;
  expect(sameColour(surface, resolvedRole.background), `the composer's painted ground on ${name} should be that palette's --rt-bg: ${surface} vs ${resolvedRole.background}`);
  expect(resolvedRole.argumentText === ' x', `the argument span should hold the typed argument on ${name}: ${JSON.stringify(resolvedRole.argumentText)}`);
  const painted = { partial: partialRole.color, resolved: resolvedRole.color, unknown: unknownRole.color, argument: resolvedRole.argument };
  const ratios = {};
  for (const [role, colour] of Object.entries(painted)) {
    expect(typeof colour === 'string' && colour !== '' && !transparent(colour), `${role} paints nothing on ${name}: ${JSON.stringify(colour)}`);
    ratios[role] = contrast(colour, surface);
    expect(ratios[role] >= 4.5, `REQ-CHAT-027: ${role} paints at ${ratios[role].toFixed(2)}:1 on ${name}, below 4.5:1`);
  }
  expect(new Set(Object.values(painted)).size === 4, `the four role colours must differ on ${name}: ${Object.values(painted).join(' | ')}`);
  paletteResults[name] = { surface, painted, ratios: Object.fromEntries(Object.entries(ratios).map(([role, r]) => [role, Number(r.toFixed(3))])) };
}
// Three palettes, not one palette measured three times.
const grounds = new Set(Object.values(paletteResults).map((p) => p.surface));
expect(grounds.size === 3, `the three palettes must paint three different grounds: ${[...grounds].join(' | ')}`);
// `/theme` against the REAL settings: the desktop preference store's own key (REQ-SHELL-128, ADR-0042).
const preferenceDocument = JSON.parse(readFileSync(join(paletteProfile.preferences, 'preferences.json'), 'utf8'));
expect(preferenceDocument['appearance/theme'] === 'high-contrast', `"/theme" must write the theme the settings surface writes: ${JSON.stringify(preferenceDocument)}`);
results.palettes = { themes: paletteResults, storedTheme: preferenceDocument['appearance/theme'] };

// ── The theme the command wrote is the theme a restart paints ─────────────────────────────────────────────────────
const restarted = launch('theme-restart', paletteProfile.workspace, paletteProfile.local, paletteProfile.preferences, {
  ROTARIS_CAPTURE_EVAL_AT: `${readTheme}@2000`,
  ROTARIS_CAPTURE_AFTER_MS: '2600',
});
const restoredTheme = evalAt(restarted, 2000);
expect(restoredTheme?.theme === 'high-contrast', `the theme "/theme" wrote should be the one a new launch paints: ${JSON.stringify(restoredTheme)}`);
expect(sameColour(restoredTheme.background, paletteResults['high-contrast'].surface), `the restarted window should paint the same ground: ${restoredTheme.background} vs ${paletteResults['high-contrast'].surface}`);
results.themeRestart = restoredTheme;

// ── `/logout` against the real providers, and REQ-CHAT-028's two live rebuilds ────────────────────────────────────
const wiredProfile = scratch('profile-wired');
const latePrompt = join(wiredProfile.workspace, '.agents', 'prompts', 'late-arrival.md');
const W = {
  firstPopup: 1500, popRow: 1800, clearA: 2000, listBefore: 2300, saveAndList: 2800,
  logout: 4200, logoutEnter: 4400, logoutToast: 5600, notice: 5700, listAfterOut: 5900,
  stash: 6600, secondPopup: 7200, popRow2: 7500, clearB: 7700, unknown: 8000, unknownEnter: 8200, unknownNotice: 8900,
  // The prompt file lands at wall-clock 16 s. Every provider command above re-bootstraps the configuration, and each
  // of those is a settings change that would re-read the roots, so the file must arrive AFTER the last of them — the
  // margin is what makes `signalBefore`'s zero mean "nothing has re-read", rather than "the file is not there yet".
  signalBefore: 18000, setField: 18500, signalAfter: 19000, thirdPopup: 23500, promptRow: 23900, end: 24600,
};
writeDuringLaunch(latePrompt, '---\ndescription: Written while the window was open\n---\nA prompt file that did not exist when the catalogue was first built.\n', 16_000);
const launchedAt = Date.now();
const wired = launch('wired', wiredProfile.workspace, wiredProfile.local, wiredProfile.preferences, {
  ROTARIS_CAPTURE_PROMPTS: `stash>>a stashed prompt@${W.stash}`,
  ROTARIS_CAPTURE_KEYS: `Return@${W.logoutEnter};;Return@${W.unknownEnter}`,
  ROTARIS_CAPTURE_EVAL_AT: [
    `${setComposer('/')}@${W.firstPopup}`, `${slashRow('pop')}@${W.popRow}`, `${setComposer('')}@${W.clearA}`,
    `${providersList}@${W.listBefore}`, `${saveProviderKeyAndList}@${W.saveAndList}`,
    `${setComposer('/logout deepseek')}@${W.logout}`, `${readNotice}@${W.notice}`, `${listUntilSignedOut}@${W.listAfterOut}`,
    `${setComposer('/')}@${W.secondPopup}`, `${slashRow('pop')}@${W.popRow2}`, `${setComposer('')}@${W.clearB}`,
    `${setComposer('/logout zzz')}@${W.unknown}`, `${readNotice}@${W.unknownNotice}`,
    `${promptSignal}@${W.signalBefore}`, `${writeSetting}@${W.setField}`, `${promptSignalWhen(2)}@${W.signalAfter}`,
    `${setComposer('/')}@${W.thirdPopup}`, `${slashRow('late-arrival')}@${W.promptRow}`,
  ].join(';;'),
  ROTARIS_CAPTURE_TEXT_AT: `Signed out of deepseek.@${W.logoutToast}`,
  ROTARIS_CAPTURE_AFTER_MS: String(W.end),
});
// `/logout`: the real catalogue, a real credential written and then removed by the command (REQ-CHAT-159).
const providersBefore = evalAt(wired, W.listBefore);
expect(Array.isArray(providersBefore) && providersBefore.some((p) => p.id === 'deepseek' && p.authenticated === false),
  `the real provider registry should list deepseek unauthenticated: ${JSON.stringify(providersBefore)}`);
const saveAndList = evalAt(wired, W.saveAndList);
expect(saveAndList?.saved?.ok === true, `the credential store should have taken the key: ${JSON.stringify(saveAndList?.saved)}`);
const providersAuthenticated = saveAndList.rows ?? [];
expect(providersAuthenticated.find((p) => p.id === 'deepseek')?.authenticated === true, `deepseek should be authenticated once the key is stored: ${JSON.stringify(providersAuthenticated)}`);
expect(wired.texts[`Signed out of deepseek.@${W.logoutToast}`] === true, 'REQ-CHAT-159: "/logout deepseek" must report what it signed out of');
const logoutNoticeWired = evalAt(wired, W.notice);
expect(logoutNoticeWired === null || logoutNoticeWired.title !== 'Command not run', `a successful /logout raises no refusal: ${JSON.stringify(logoutNoticeWired)}`);
const signedOutRead = evalAt(wired, W.listAfterOut);
const providersSignedOut = signedOutRead?.rows ?? [];
expect(providersSignedOut.find((p) => p.id === 'deepseek')?.authenticated === false, `the command should have signed deepseek out (read back over ${signedOutRead?.waitedMs} ms): ${JSON.stringify(signedOutRead)}`);
const credentialFiles = [];
(function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name === 'deepseek.json') credentialFiles.push(path);
  }
})(wiredProfile.local);
expect(credentialFiles.length === 0, `the credential file must be gone after /logout: ${credentialFiles.join(', ')}`);
// REQ-CHAT-159's "available" clause names the provider registry's own rows, in its own order.
const unknownProvider = evalAt(wired, W.unknownNotice);
const providerIds = providersSignedOut.map((p) => p.id);
expect(unknownProvider?.message === `Unknown provider 'zzz'. Available: ${providerIds.join(', ')}`,
  `the rejected value and the real providers in their source's order: ${JSON.stringify(unknownProvider)} vs ${JSON.stringify(providerIds)}`);
// REQ-CHAT-028, trigger 1 — the LIBRARY: `/pop` is listed and unavailable while the stash is empty, and becomes
// available once a stash row is written through `prompts.push`, with no restart (REQ-LIBRARY-142).
const popBefore = evalAt(wired, W.popRow);
expect(popBefore?.popup === true && popBefore.row?.available === '0' && popBefore.row.title === 'No stashed prompts. Use Stash beside the composer first.',
  `with an empty stash /pop is listed and unavailable with its stated reason: ${JSON.stringify(popBefore)}`);
const popAfter = evalAt(wired, W.popRow2);
expect(popAfter?.popup === true && popAfter.row?.available === '1', `REQ-CHAT-028: a library change must rebuild the catalogue in place: ${JSON.stringify(popAfter)}`);
// REQ-CHAT-028, trigger 2 — the SETTINGS: a prompt file that arrived after start-up is invisible until a settings
// change, and is offered immediately after one. The first read is what makes the second mean anything.
const signalBefore = evalAt(wired, W.signalBefore);
expect(signalBefore?.roots === 'read' && signalBefore.count === 0,
  `the file written during the launch must not be registered before the settings change: ${JSON.stringify(signalBefore)}`);
const settingWritten = evalAt(wired, W.setField);
expect(settingWritten?.ok === true, `the settings write should have been accepted: ${JSON.stringify(settingWritten)}`);
const signalAfter = evalAt(wired, W.signalAfter);
expect(signalAfter?.count === 2, `REQ-CHAT-028: the settings change must rebuild the catalogue from the roots (both names of the new file): ${JSON.stringify(signalAfter)}`);
const promptRow = evalAt(wired, W.promptRow);
expect(promptRow?.popup === true && promptRow.row?.kind === 'prompt' && promptRow.row.text.includes('/late-arrival — Written while the window was open'),
  `the new prompt file must be usable without a restart: ${JSON.stringify(promptRow)}`);
expect(existsSync(latePrompt), 'the prompt file was never written during the launch');
results.rebuild = {
  library: { before: popBefore.row, after: popAfter.row },
  settings: { before: signalBefore, after: signalAfter, row: promptRow.row },
  promptFileWrittenAfterLaunchMs: Math.round(statSync(latePrompt).mtimeMs - launchedAt),
};
results.logout = { before: providersBefore, saved: saveAndList.saved, authenticated: providersAuthenticated.find((p) => p.id === 'deepseek'), afterSignOut: providersSignedOut.find((p) => p.id === 'deepseek'), signOutVisibleAfterMs: signedOutRead?.waitedMs ?? null, unknown: unknownProvider?.message, credentialFilesLeft: credentialFiles.length };

results.passed = true;
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`slash-proof PASSED ${join(output, 'results.json')}`);
