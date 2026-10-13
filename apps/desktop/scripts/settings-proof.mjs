/**
 * The Settings proof (Part AG): the four categories that were the placeholder — Display (REQ-CONFIG-403,
 * REQ-CONFIG-472), Instructions and Tools (REQ-CONFIG-276/277, REQ-TOOLS-165) and About (REQ-CONFIG-398,
 * REQ-SHELL-138..143) — plus the save bar every category now shows (REQ-CONFIG-270) and the corrected
 * `display:` keys of REQ-CONFIG-172. Scripted client, scratch profile, nine launches — 1 is three of them:
 *
 *   1. no-workspace, tools, instructions-empty — Electron started with no workspace: About carries the version, an em
 *                     dash for Build and REQ-SHELL-142's caption; the Tools inventory is fully populated (REQ-CONFIG-277
 *                     populates it unconditionally); Instructions is empty and names the file to create.
 *   1′. about-present — the same About page with both of its files present (first-release-plan.md §4.4): the Build
 *                     row carries the identifier `pnpm build-id` wrote for this tree, no caption stands under the
 *                     licensing control, and the control opens the notices file where about.ts found it.
 *   1″. about-minimum — the same About page at REQ-SHELL-022's minimum content size, 1000×680: REQ-STARTUP-160's
 *                     network-activity disclosure is under its labelled heading, carries its three statements, and a
 *                     real pointer selection across it, once it is scrolled into view, reads every one of them
 *                     (`docs/defects/fixed/the-about-page-carries-no-network-activity-disclosure.md`).
 *   2. instructions — the same workspace with `AGENTS.md` and `AGENTS.override.md` on disk: two rows, in the
 *                     requirement's order, source `workspace`, described by absolute path; the first row's switch
 *                     is turned off and saved, and the `instructions.overrides` policy lands in the file
 *                     (PD-WORKSPACE-002). The home-relative bases resolve into a scratch home and the machine-wide
 *                     base into a scratch directory, so the operator's own files never reach the inventory.
 *   3. display      — the Display category: the four caps moved, the save bar going dirty and back to saved, the
 *                     file written under REQ-CONFIG-172's key names with unlimited as `0`, and the two desktop
 *                     preferences written the moment they move.
 *   4. reopen       — the same profile again: the four controls come back on the saved values, the form is clean,
 *                     and the two preferences survived.
 *   5. live-apply   — a scripted run leaves a tool row on screen; changing a display control and leaving Settings
 *                     raises REQ-CONFIG-286's guard, and Save puts the new value on the row already drawn.
 *   6. falsified    — a file written with Part Z's key names governs nothing: the controls show the requirement's
 *                     defaults instead (REQ-CONFIG-172).
 *   7. run-start    — the Runtime category's run-start mode hint (REQ-ORCH-152, REQ-CONFIG-320, PD-ORCH-003), in a
 *                     workspace of its own set to `plan`: with no session followed it says what `plan` does and never
 *                     that the gate is not built; then a prompt is held at the gate, the plan approved, and the approved
 *                     session reopened, where the same hint states that the session is released and names the control
 *                     that re-arms it (`docs/defects/fixed/the-run-start-setting-says-the-plan-gate-is-not-built.md`).
 *   8. personas-unset — the Personas Scope column (REQ-CONFIG-341), in a workspace of its own whose file sets only
 *                     `personas.tester.model`: the tester's Unset is found by its accessible name ("Unset model for
 *                     tester") and clicked; while the unset is pending no row reads its old origin and no Unset is
 *                     offered; Discard brings `model: workspace` and its named Unset back.
 *   9. personas-two-scopes — one role's edits at two scopes (REQ-CONFIG-259/341): the tester's model Unset clicked at
 *                     Workspace and its reasoning Unset at Global, then Save; the workspace file loses the model, the
 *                     global file loses the reasoning and keeps its model, and the row reads the global model and the
 *                     default reasoning afterwards.
 *  10. personas-one-field-two-scopes — one field's edits at both scopes (REQ-CONFIG-341, REQ-MONITOR-149): the tester's
 *                     model Unset clicked at Workspace, then a model picked for it at Global, then Save; the workspace
 *                     file loses its override and the global file holds the pick, which the row then reads.
 *  11. reload-clean — a configuration change arriving while Settings is open (REQ-CONFIG-419, REQ-SHELL-041): the
 *                     Runtime category's memory-diagnostics switch writes its key at once and the reloaded snapshot is
 *                     announced back to this window, as a sign-in's is. With nothing edited the strip carries no
 *                     `unsaved settings` and the save bar stays saved; after a real edit, a second reload keeps the edit
 *                     and the flag (`docs/defects/fixed/a-sign-in-reload-marks-settings-unsaved-though-nothing-was-edited.md`).
 *  11′. reload-last-write — the same workspace (REQ-CONFIG-419, REQ-CONFIG-423): two real writes of the circuit breaker
 *                     (off, then on) whose announcements the capture hands the window in one tick leave the form clean
 *                     with the breaker on (`docs/defects/fixed/two-quick-configuration-reloads-mark-settings-unsaved.md`);
 *                     then `restricted` picked here and left unsaved is displaced by `autonomous` written through the
 *                     composer's path, and the form reads clean
 *                     (`docs/defects/fixed/a-permission-mode-written-elsewhere-loses-to-an-unsaved-settings-selection.md`).
 *
 * The legal links and the licence bundle are exercised through the capture seam's scripted opener
 * (`ROTARIS_CAPTURE_OPEN_EXTERNAL`), which reports success or the platform refusal without launching a browser.
 *
 * **The About page's two files are staged, and given back.** Launched as `electron out/main/index.js`, the app reads them
 * from `apps/desktop/resources/` (about.ts's source-tree fallback), where `pnpm build-id` and `pnpm notices` also write the
 * real ones. Before launch 1 any real file is moved into `.proof/settings-proof.assets/` so the absent branch is measured
 * whatever an earlier build left; launch 1′ writes the build identifier with the real writer and a notices fixture; and
 * the directory is restored as found the moment 1′ ends, or by the next run if this one is killed. A real file written
 * between a killed run and the next is kept, not taken for the proof's (`lib/staged-resources.mjs`).
 *
 * Evidence under `.proof/settings-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { cleanEnvironment, configDirFor, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { ABOUT_ASSETS } from './lib/about-assets.mjs';
import { produce, put, restore, stage } from './lib/staged-resources.mjs';
import { REDIRECTING } from '../../../tools/build-id/build-id.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'settings-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
// first-release-plan.md §4.4: the About page's two assets, where the built app reads them from the source tree, and the
// stash that holds what was there while the proof owns those names. The stash sits beside `output`, never inside it,
// because `output` is removed below and a stash an interrupted run left must survive until it is given back.
const resources = join(app, 'resources');
const stash = resolve(repo, '.proof', 'settings-proof.assets');
const { buildId: BUILD_ID, notices: NOTICES } = ABOUT_ASSETS;
const recovered = restore(resources, stash);
if (recovered.length > 0) console.log(`settings proof: an earlier run was interrupted; ${recovered.join('; ')}`);
rmSync(output, { recursive: true, force: true });
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
  '.app-shell', '.save-bar__status', '[data-testid="about-row"]', '[data-testid="legal-link"]',
  '[data-testid="legal-error"]', '[data-testid="licenses-caption"]', '[data-testid="licenses-error"]', '.about__value',
  '[data-testid="inventory-row"]', '[data-testid="inventory-empty"]', '[data-testid="instruction-toggle"]',
  '[data-testid="tool-result-lines"]', '[data-testid="tool-input-lines"]',
  '[data-testid="show-tool-results"]', '[data-testid="show-tool-inputs"]',
  '[data-testid="auto-collapse-tools"]', '[data-testid="group-tools"]', '[data-testid="show-reasoning"]',
  '.settings__body', '[data-testid="run-start-hint"]',
  '#about-network-heading', '[data-testid="network-disclosure-statement"]',
];

async function launch(name, workspace, local, preferences, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  // `hostSwitches`: as root Chromium starts only with `--no-sandbox`; on every other host the list is empty.
  const args = [join(app, 'out', 'main', 'index.js'), ...hostSwitches];
  if (workspace !== null) args.push(workspace);
  const result = await spawnBounded(electron, args, {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      // PD-WORKSPACE-002: the scratch home for instruction-file discovery, so this proof exercises the
      // home-relative bases without reading the operator's own files (the skills proof's seam pattern), and the
      // scratch machine-wide directory for the same reason: an `/etc/codex/AGENTS.md` on the host would otherwise be
      // a third row in the exact Instructions inventory below, and an `/etc/codex/skills` entry would reach the run.
      ROTARIS_CAPTURE_INSTRUCTIONS_HOME: home,
      ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE: machine,
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return { png, log, probes };
}
const rows = (probes, selector) => probes[selector] ?? [];
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;
const text = (probes, selector) => rows(probes, selector).map((p) => p.text);

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
const home = join(root, 'home');
const machine = join(root, 'machine-codex');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(machine, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
const configFile = join(workspace, '.rotaris', 'agents.yaml');
writeFileSync(configFile, [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'display:',
  '  # a key the settings screen does not offer: REQ-CONFIG-256 leaves it exactly as the file states it',
  '  show_thinking: true',
  '',
].join('\n'));
// The file the scripted `read` step reads (launch 5), long enough that a cap has something to cut short.
writeFileSync(join(workspace, 'README.md'), ['# Settings proof workspace', ...Array.from({ length: 30 }, (_, i) => `line ${i + 1}`), ''].join('\n'));
const results = {};

/** Open Settings (Ctrl+7) on a named category, and give the view time to paint. */
const openCategory = (label, atMs = 900) => ({ ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: String(atMs), ROTARIS_CAPTURE_SETTINGS: label });

// ── 1. No workspace: About, Tools and the empty Instructions ────────────────────────────────────────────────
// The About page's two files are the proof's from here until launch 1′ ends: whatever a build left is moved aside, so
// this launch measures the absent branch of each. `finally` gives them back when a launch fails or its Electron dies.
// A signal to this process is not caught here. Under `spawnSync` (until 2026-09-29) Node would have run a handler only
// once the launch returned, holding a SIGTERM until then. The launch is `spawnBounded`'s now, whose own handler runs at
// once during a launch: it SIGKILLs the application's process group and raises the signal again, so the proof still
// dies of it without reaching `finally`. The process goes, and the next run's `restore` repairs it.
// In a clone that has never built, the directory itself is the proof's: `pnpm build-id` makes it during 1′.
const hadResources = existsSync(resources);
const emptyAndNew = () => !hadResources && existsSync(resources) && readdirSync(resources).length === 0;
const giveBack = () => {
  for (const line of restore(resources, stash)) console.log(`settings proof: ${line}`);
  if (emptyAndNew()) rmdirSync(resources);
};
const digest = (name) => (existsSync(join(resources, name)) ? createHash('sha256').update(readFileSync(join(resources, name))).digest('hex') : null);
const found = { [BUILD_ID]: digest(BUILD_ID), [NOTICES]: digest(NOTICES) };
stage(resources, stash, [BUILD_ID, NOTICES]);
let noWorkspace;
let present;
let written;
try {
  noWorkspace = await launch('no-workspace', null, local, preferences, {
    ...openCategory('About'),
    ROTARIS_CAPTURE_OPEN_EXTERNAL: 'record',
    // Click the first legal link and the licence bundle: one reports success, the other the absent bundle.
    ROTARIS_CAPTURE_CLICKS: '[data-testid="legal-link"]>>Privacy Policy@2200;;[data-testid="licenses-open"]@2600',
    ROTARIS_CAPTURE_AFTER_MS: '3600',
  });

  // ── 1′. The same About page with both files present (first-release-plan.md §4.4) ──────────────────────────────
  // The build identifier is the real writer's, over this tree, so the row shows what a package of this tree would carry.
  // The notices file is a fixture: `pnpm notices` refuses until O-3, O-11 and OQ-74 are answered, and the About page asks
  // only that the file exist and open (REQ-SHELL-142).
  const writer = produce(resources, stash, BUILD_ID, () => spawnSync(process.execPath, [join(repo, 'tools', 'build-id', 'write.mjs')], { cwd: repo, encoding: 'utf8' }));
  writeFileSync(join(output, 'build-id.log'), `${writer.stdout ?? ''}\n${writer.stderr ?? ''}`);
  if (writer.status !== 0) throw new Error(`pnpm build-id exited ${writer.status ?? writer.signal}: ${writer.stderr}`);
  written = readFileSync(join(resources, BUILD_ID), 'utf8');
  put(resources, stash, NOTICES, 'THIRD-PARTY-LICENSES.txt — a fixture written by settings-proof (first-release-plan.md §4.4), removed when the launch ends.\n');
  present = await launch('about-present', null, local, preferences, {
    ...openCategory('About'),
    ROTARIS_CAPTURE_OPEN_EXTERNAL: 'record',
    ROTARIS_CAPTURE_CLICKS: '[data-testid="licenses-open"]@2200',
    ROTARIS_CAPTURE_AFTER_MS: '3200',
  });
} finally {
  giveBack();
}
const aboutRows = Object.fromEntries(rows(noWorkspace.probes, '[data-testid="about-row"]').map((r) => [r.data['data-name'], r.data['data-value']]));
// REQ-STARTUP-158 / REQ-STARTUP-007: the version the running app reports is the one place a release declares it
// (`tools/release-guard`), never Electron's own — this unpacked build read "v44.1.1" until `main/version.ts`.
const declaredVersion = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version;
if (aboutRows.Version !== `v${declaredVersion}`) throw new Error(`the Version row read "${aboutRows.Version}", not the declared v${declaredVersion}`);
// REQ-SHELL-140: with no build asset where the app reads it, the row is the em dash rather than an invented identifier.
if (aboutRows.Build !== '—') throw new Error(`the Build row was "${aboutRows.Build}", not the em dash`);
if (aboutRows.Publisher !== 'Concrete Dynamics UG (haftungsbeschränkt)') throw new Error(`the publisher row was "${aboutRows.Publisher}"`);
if (aboutRows['Security contact'] !== 'security@concrete-dynamics.com') throw new Error(`the security contact row was "${aboutRows['Security contact']}"`);
if (!['Standalone build', 'Package installation'].includes(aboutRows.Installation)) throw new Error(`the Installation row was "${aboutRows.Installation}"`);
const legal = rows(noWorkspace.probes, '[data-testid="legal-link"]').map((r) => [r.text, r.data['data-url']]);
const expectedLegal = [
  ['Privacy Policy', 'https://rotaris.ai/privacy'], ['EULA', 'https://rotaris.ai/eula'], ['Terms / AGB', 'https://rotaris.ai/terms'],
  ['Acceptable Use Policy', 'https://rotaris.ai/acceptable-use'], ['Withdrawal / Widerrufsbelehrung', 'https://rotaris.ai/widerruf'],
];
if (JSON.stringify(legal) !== JSON.stringify(expectedLegal)) throw new Error(`the legal documents were ${JSON.stringify(legal)}`);
if (!noWorkspace.log.includes('capture: open-external https://rotaris.ai/privacy')) throw new Error('the Privacy Policy link did not reach the system browser');
if (text(noWorkspace.probes, '[data-testid="legal-error"]').length !== 0) throw new Error('a successful open left an error caption on screen');
// REQ-SHELL-142: with no bundle where the app reads it, the caption says so and the click is refused.
const caption = text(noWorkspace.probes, '[data-testid="licenses-caption"]')[0] ?? '';
if (caption !== 'This build does not carry a third-party license bundle.') throw new Error(`the licensing caption was "${caption}"`);
// The caption is set at its neighbours' type token (`--rt-text-sm`, `.about__value`'s), not the browser's default: until 2026-09-28
// it was the largest text on the page (docs/defects/fixed/the-about-pages-licence-caption-is-set-in-the-browsers-default-size.md).
const captionSize = first(noWorkspace.probes, '[data-testid="licenses-caption"]')?.fontSize;
const valueSizes = [...new Set(rows(noWorkspace.probes, '.about__value').map((p) => p.fontSize))];
if (valueSizes.length !== 1 || valueSizes[0] === undefined) throw new Error(`the About values did not share one computed font size: ${JSON.stringify(valueSizes)}`);
if (captionSize !== valueSizes[0]) throw new Error(`the licensing caption is set at ${captionSize}, its neighbours at ${valueSizes[0]}`);
if (text(noWorkspace.probes, '[data-testid="licenses-error"]')[0] !== 'Could not open the third-party license bundle.') throw new Error('clicking the bundle control reported no refusal');
results.about = { rows: aboutRows, legal: legal.length, opened: 'https://rotaris.ai/privacy', caption, captionSize, valueSize: valueSizes[0] };

// REQ-SHELL-140 / REQ-SHELL-142, the present branch of each (first-release-plan.md §4.4).
const presentRows = Object.fromEntries(rows(present.probes, '[data-testid="about-row"]').map((r) => [r.data['data-name'], r.data['data-value']]));
// Asked of this repository as the writer asks it: without an enclosing git process's variables, which would name another.
const head = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !REDIRECTING.includes(k))) }).stdout.trim();
// One line, exactly as the writer wrote it, and naming this tree's commit: `-dirty` when the tree differs from it.
if (!/^[^\n]+\n$/.test(written)) throw new Error(`pnpm build-id wrote ${JSON.stringify(written)}, not one line`);
if (presentRows.Build !== written.trim()) throw new Error(`the Build row was "${presentRows.Build}", not the identifier pnpm build-id wrote ("${written.trim()}")`);
if (!new RegExp(`^${head}(-dirty)?$`).test(presentRows.Build)) throw new Error(`the Build row "${presentRows.Build}" does not name HEAD (${head})`);
if (text(present.probes, '[data-testid="licenses-caption"]').length !== 0) throw new Error(`the absent caption stood beside a bundle that is present: "${text(present.probes, '[data-testid="licenses-caption"]')[0]}"`);
const openedLicenses = `capture: open-licenses ${join(resources, NOTICES)}`;
if (!present.log.includes(openedLicenses)) throw new Error(`the licensing control did not open the bundled file (${openedLicenses} not in the log)`);
if (text(present.probes, '[data-testid="licenses-error"]').length !== 0) throw new Error('opening the present bundle left a refusal on screen');
results.aboutPresent = { build: presentRows.Build, head, caption: null, opened: relative(repo, join(resources, NOTICES)) };
// And the directory is as the proof found it: no fixture outlives the launch.
if (existsSync(stash)) throw new Error(`the stash ${stash} was not given back`);
const after = { [BUILD_ID]: digest(BUILD_ID), [NOTICES]: digest(NOTICES) };
if (JSON.stringify(after) !== JSON.stringify(found)) throw new Error(`apps/desktop/resources was not left as found: before ${JSON.stringify(found)}, after ${JSON.stringify(after)}`);
results.assetsRestored = { [BUILD_ID]: found[BUILD_ID] ? 'the file that was there, byte for byte' : 'absent, as before', [NOTICES]: found[NOTICES] ? 'the file that was there, byte for byte' : 'absent, as before' };

// ── 1″. REQ-STARTUP-160's disclosure, at REQ-SHELL-022's minimum window size ─────────────────────────────────────
// Static text, so it reads as launch 1 drew it whatever main supplied; here the window is shrunk to the minimum content
// size first, and a REAL pointer selection is dragged across the section after the seam scrolls it into view: text a
// hover revealed, a collapsed control hid or an overflow clipped would not be selected (REQ-STARTUP-160: "reachable,
// operable and fully labelled at the minimum window size").
const disclosureOf = (probes) => text(probes, '[data-testid="network-disclosure-statement"]');
const disclosure = disclosureOf(noWorkspace.probes);
const heading = text(noWorkspace.probes, '#about-network-heading')[0] ?? '';
if (heading !== 'Network activity') throw new Error(`the disclosure's heading read "${heading}", not "Network activity"`);
if (disclosure.length !== 3) throw new Error(`the About page carried ${disclosure.length} disclosure statements, not REQ-STARTUP-160's three: ${JSON.stringify(disclosure)}`);
const owed = [
  ['first launch', 'warming caches', 'may contact', 'tool archives', 'package registries', 'only for work this machine has not already done'],
  ['supported standalone build', 'release endpoint', 'each time one of its windows is activated', 'cannot be turned off'],
  ['IP address', 'never carry', 'project files', 'prompt text', 'provider credentials'],
];
owed.forEach((parts, i) => { for (const part of parts) if (!disclosure[i].includes(part)) throw new Error(`disclosure statement ${i + 1} does not say "${part}": "${disclosure[i]}"`); });
// REQ-STARTUP-160: "SHALL name no host, endpoint, or request this document does not require" — this text names none at all.
for (const statement of disclosure) if (/:\/\/|\bwww\.|\.(com|org|io|net|ai|dev)\b|github|npmjs|pypi|api\./i.test(statement)) throw new Error(`a disclosure statement names a host: "${statement}"`);
const minimum = await launch('about-minimum', null, local, preferences, {
  ...openCategory('About'),
  ROTARIS_CAPTURE_RESIZE: '1000x680@400',
  ROTARIS_CAPTURE_DRAG_AT: '[data-testid="network-disclosure"]@2400',
  ROTARIS_CAPTURE_AFTER_MS: '3400',
});
const resized = /capture: resize at \d+ → content (\d+)×(\d+)/.exec(minimum.log);
if (!resized || resized[1] !== '1000' || resized[2] !== '680') throw new Error(`the window was not shrunk to REQ-SHELL-022's 1000×680 (${resized?.[0] ?? 'no resize line'})`);
const dragged = /capture: drag-at \d+ \[data-testid="network-disclosure"\] → (.*)$/m.exec(minimum.log);
if (!dragged) throw new Error('the pointer selection across the disclosure did not run (no drag-at line in about-minimum.log)');
const selected = JSON.parse(dragged[1]);
if (typeof selected !== 'string') throw new Error(`the disclosure was not found at the minimum size: ${dragged[1]}`);
const flat = (s) => s.replace(/\s+/g, ' ').trim();
for (const statement of [heading, ...disclosureOf(minimum.probes)]) if (!flat(selected).includes(flat(statement))) throw new Error(`a pointer selection across the disclosure at 1000×680 did not read "${statement}"; it read ${JSON.stringify(selected)}`);
if (JSON.stringify(disclosureOf(minimum.probes)) !== JSON.stringify(disclosure)) throw new Error('the disclosure at the minimum size differs from the one at the default size');
results.networkDisclosure = { heading, statements: disclosure.length, minimumSize: `${resized[1]}×${resized[2]}`, selectedAtMinimum: flat(selected).length };

// The Tools inventory, and the empty Instructions, in the same launch profile (no workspace at all).
const tools = await launch('tools', null, local, preferences, { ...openCategory('Tools'), ROTARIS_CAPTURE_AFTER_MS: '2600' });
const toolRows = rows(tools.probes, '[data-testid="inventory-row"]');
// REQ-CONFIG-277: populated unconditionally — with no workspace open at all.
if (toolRows.length !== 19) throw new Error(`the Tools inventory listed ${toolRows.length} rows, not the nineteen public names`);
const toolNames = toolRows.map((r) => r.data['data-name']);
if (JSON.stringify(toolNames) !== JSON.stringify([...toolNames].sort((a, b) => a.localeCompare(b)))) throw new Error(`the Tools inventory was not sorted: ${toolNames.join(', ')}`);
if (toolRows.some((r) => r.data['data-source'] !== 'built-in')) throw new Error('a Tools row carried a source other than built-in');
if (!toolRows.find((r) => r.data['data-name'] === 'git_commit')?.text.includes('no executor registered')) throw new Error('the row for the unimplemented name did not say so');
results.tools = { rows: toolRows.length, sorted: true, source: 'built-in' };

const noFiles = await launch('instructions-empty', workspace, local, preferences, { ...openCategory('Instructions'), ROTARIS_CAPTURE_AFTER_MS: '2600' });
if (rows(noFiles.probes, '[data-testid="inventory-row"]').length !== 0) throw new Error('the Instructions inventory listed a row before either file existed');
const emptyState = text(noFiles.probes, '[data-testid="inventory-empty"]')[0] ?? '';
if (!emptyState.includes('AGENTS.md') || !emptyState.includes(workspace)) throw new Error(`the empty state did not name the file to create: "${emptyState}"`);
results.instructionsEmpty = { rows: 0, namesTheFile: true };

// ── 2. Both instruction files on disk ───────────────────────────────────────────────────────────────────────
writeFileSync(join(workspace, 'AGENTS.md'), '# standing instructions\n');
writeFileSync(join(workspace, 'AGENTS.override.md'), '# overriding instructions\n');
const instructions = await launch('instructions', workspace, local, preferences, {
  ...openCategory('Instructions'),
  // PD-WORKSPACE-002: switch the first file off and save — the per-file policy round trip.
  ROTARIS_CAPTURE_CLICKS: '[data-testid="instruction-toggle"][data-id="workspace:AGENTS.md"]@1600;;.save-bar .btn-primary>>Save@3200',
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
const listed = rows(instructions.probes, '[data-testid="inventory-row"]').map((r) => [r.data['data-name'], r.data['data-source'], r.text]);
if (listed.length !== 2) throw new Error(`the Instructions inventory listed ${listed.length} rows`);
if (listed[0][0] !== 'AGENTS.md' || listed[1][0] !== 'AGENTS.override.md') throw new Error(`the order was ${listed.map((l) => l[0]).join(', ')}`);
if (listed.some((l) => l[1] !== 'workspace')) throw new Error('an Instructions row carried a source other than workspace');
if (!listed.every((l) => l[2].includes(join(workspace, l[0])))) throw new Error(`a row did not describe its file by absolute path: ${JSON.stringify(listed)}`);
results.instructions = { rows: listed.map((l) => l[0]), source: 'workspace', absolutePaths: true };
// PD-WORKSPACE-002: two switches, and the first file's switch stayed off through Save.
const toggles = rows(instructions.probes, '[data-testid="instruction-toggle"]');
if (toggles.length !== 2) throw new Error(`the Instructions tab carried ${toggles.length} switches, not two`);
if (toggles[0].data['data-on'] !== 'false') throw new Error('the AGENTS.md switch did not stay off through Save');
if (toggles[1].data['data-on'] !== 'true') throw new Error('the AGENTS.override.md switch did not stay on');
const instructionsYaml = readFileSync(configFile, 'utf8');
if (!/workspace:AGENTS\.md: off/.test(instructionsYaml)) throw new Error(`the per-file policy was not written:\n${instructionsYaml}`);
results.instructionToggle = { off: 'workspace:AGENTS.md', file: true };

// ── 3. The Display category: move all seven, save, and read the file ──────────────────────────────────────────
const display = await launch('display', workspace, local, preferences, {
  ...openCategory('Display'),
  // The two preferences first (immediate), then the four configuration fields (deferred to Save).
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="auto-collapse-tools"]@1600',
    '[data-testid="group-tools"]@1900',
    '[data-testid="show-reasoning"]@2050', // N71 (2026-10-13) — REQ-CHAT-167's switch, a third desktop preference
    '[data-testid="show-tool-results"]@2200',
    '.save-bar .btn-primary>>Save@4200',
  ].join(';;'),
  ROTARIS_CAPTURE_SELECT: '[data-testid="tool-result-lines"]>>20@2600;;[data-testid="tool-input-lines"]>>unlimited@3000',
  ROTARIS_CAPTURE_PROBE_AT: '.save-bar__status@3600',
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
// REQ-CONFIG-270: the bar is on screen in the Display category, and it went dirty when a control moved.
const dirtyLine = display.log.split('\n').find((l) => l.includes('probe-at 3600 .save-bar__status'));
if (!dirtyLine || !dirtyLine.includes('Unsaved changes')) throw new Error(`the save bar did not report unsaved changes after the seven controls moved: ${dirtyLine ?? 'no probe'}`);
if ((text(display.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error(`after Save the bar read "${text(display.probes, '.save-bar__status')[0]}"`);
const savedYaml = readFileSync(configFile, 'utf8');
// REQ-CONFIG-172: the requirement's key names, unlimited as 0, and the foreign key untouched (REQ-CONFIG-256).
if (!/tool_result_max_lines: 20/.test(savedYaml)) throw new Error(`the file does not carry the result cap:\n${savedYaml}`);
if (!/tool_input_max_lines: 0/.test(savedYaml)) throw new Error(`unlimited was not written as 0:\n${savedYaml}`);
if (!/show_tool_results: false/.test(savedYaml)) throw new Error(`the results toggle was not written:\n${savedYaml}`);
if (!/show_thinking: true/.test(savedYaml)) throw new Error(`the key this screen does not offer was disturbed:\n${savedYaml}`);
if (/tool_result_lines:/.test(savedYaml)) throw new Error(`Part Z's falsified key name was written:\n${savedYaml}`);
// REQ-CONFIG-403: the two preferences were written the moment they moved, before any Save.
const prefs = JSON.parse(readFileSync(join(preferences, 'preferences.json'), 'utf8'));
if (prefs['display/autoCollapseTools'] !== true) throw new Error(`the auto-collapse preference is ${JSON.stringify(prefs['display/autoCollapseTools'])}`);
if (prefs['display/groupTools'] !== false) throw new Error(`the grouping preference is ${JSON.stringify(prefs['display/groupTools'])}`);
// REQ-CHAT-167 (N71): the reasoning switch writes `display/showReasoning`, which nothing wrote before 2026-10-13.
if (prefs['display/showReasoning'] !== true) throw new Error(`the reasoning preference is ${JSON.stringify(prefs['display/showReasoning'])}`);
results.display = { dirtyThenSaved: true, file: { tool_result_max_lines: 20, tool_input_max_lines: 0, show_tool_results: false, foreignKeyKept: true }, preferences: { autoCollapseTools: true, groupTools: false, showReasoning: true } };

// ── 4. Reopen: the saved values come back, and the form is clean ─────────────────────────────────────────────
const reopen = await launch('reopen', workspace, local, preferences, { ...openCategory('Display'), ROTARIS_CAPTURE_AFTER_MS: '3000' });
const resultCap = first(reopen.probes, '[data-testid="tool-result-lines"]')?.value;
const inputCap = first(reopen.probes, '[data-testid="tool-input-lines"]')?.value;
if (resultCap !== '20') throw new Error(`the result cap came back as ${resultCap}`);
// REQ-CONFIG-172/175: 0 in the file is unlimited on the control, which is the whole round trip.
if (inputCap !== 'unlimited') throw new Error(`the input cap came back as ${inputCap}`);
if (first(reopen.probes, '[data-testid="show-tool-results"]')?.data['data-on'] !== 'false') throw new Error('the results toggle did not come back off');
if (first(reopen.probes, '[data-testid="auto-collapse-tools"]')?.data['data-on'] !== 'true') throw new Error('the auto-collapse preference did not survive the relaunch');
if (first(reopen.probes, '[data-testid="group-tools"]')?.data['data-on'] !== 'false') throw new Error('the grouping preference did not survive the relaunch');
if (first(reopen.probes, '[data-testid="show-reasoning"]')?.data['data-on'] !== 'true') throw new Error('the reasoning preference did not survive the relaunch (REQ-CHAT-167)');
// REQ-CONFIG-419/425: a read repopulates and the form starts clean.
if ((text(reopen.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error(`the reopened form was not clean: "${text(reopen.probes, '.save-bar__status')[0]}"`);
results.reopen = { tool_result_lines: resultCap, tool_input_lines: inputCap, clean: true, preferencesKept: true };

// ── 5. The transcript follows the settings screen, and the guard stands between them ────────────────────────
// The file says `show_tool_results: false` after launch 3, so the transcript draws no tool output. Turning the
// control back on and leaving Settings raises REQ-CONFIG-286's guard; answering Save both writes the file and
// puts the new value on the row that was already drawn.
//
// **What this launch does NOT show, and why:** REQ-CONFIG-472 says a change reaches the rows already on screen
// the moment the control moves. In this shell Settings *replaces* the Workspace (REQ-SHELL-023's seven views),
// and a dirty form cannot be left without answering the guard — so a state in which the pending value and the
// file disagree while a transcript is visible is unreachable in the main window. The renderer publishes its
// pending caps to the transcript all the same (`pendingDisplay`), which is what makes Discard show immediately
// and what a second transcript surface would read; the narrowing is recorded rather than papered over.
const live = await launch('live-apply', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'read,answer',
  ROTARIS_CAPTURE_PROMPT: 'Read the file.',
  // The timings clear code intelligence's discovery at run start (~5 s, Part T), so the tool row exists first.
  ROTARIS_CAPTURE_PROBE_AT: '.tool__preview@13000;;.dialog-title@18000',
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: '14000', ROTARIS_CAPTURE_SETTINGS: 'Display',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="show-tool-results"]@15500;;.dialog-actions .btn-primary>>Save@18500',
  ROTARIS_CAPTURE_CHORDS: 'Ctrl+2@17500',
  ROTARIS_CAPTURE_PROBE: [...PROBES, '.tool__preview', '.dialog-title'].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '21000',
}, 180_000);
const before = /probe-at 13000 \.tool__preview → (\[.*\])/.exec(live.log)?.[1] ?? '[]';
const beforeText = JSON.parse(before).map((p) => p.text).join(' | ');
if (!/⤷/.test(beforeText)) throw new Error(`no tool row was drawn before the change: ${beforeText}`);
// Saved `show_tool_results: false`: the preview carries the marker and nothing of the result.
if (beforeText.replace('⤷', '').trim() !== '') throw new Error(`the saved setting did not hide the result: "${beforeText}"`);
// REQ-CONFIG-286: leaving a dirty settings screen raises the guard rather than dropping the change.
const guard = /probe-at 18000 \.dialog-title → (\[.*\])/.exec(live.log)?.[1] ?? '[]';
if (!JSON.parse(guard).some((p) => p.text === 'Save settings before leaving?')) throw new Error(`the unsaved guard did not stand between Settings and the view switch: ${guard}`);
const afterText = text(live.probes, '.tool__preview').join(' | ');
// The row's preview is the result's own first line, which the read tool heads with the file it read.
if (!/README\.md/.test(afterText)) throw new Error(`the change did not reach the row already on screen: "${afterText}"`);
const afterYaml = readFileSync(configFile, 'utf8');
if (!/show_tool_results: true/.test(afterYaml)) throw new Error(`the guard's Save did not write the file:
${afterYaml}`);
results.liveApply = { before: beforeText.slice(0, 40), after: afterText.slice(0, 40), guard: 'Save settings before leaving?', file: 'show_tool_results: true' };

// ── 6. The falsified keys are dead: a file written Part Z's way governs nothing ──────────────────────────────
writeFileSync(configFile, [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'display:',
  '  # Part Z read these two; no requirement ever stated them (REQ-CONFIG-172).',
  '  tool_result_lines: 50', '  tool_input_lines: 1', '',
].join('\n'));
const falsified = await launch('falsified-keys', workspace, local, preferences, { ...openCategory('Display'), ROTARIS_CAPTURE_AFTER_MS: '3000' });
const fResult = first(falsified.probes, '[data-testid="tool-result-lines"]')?.value;
const fInput = first(falsified.probes, '[data-testid="tool-input-lines"]')?.value;
if (fResult !== '10' || fInput !== '2') throw new Error(`the falsified keys still govern: result=${fResult} input=${fInput}`);
// That the two also WARN as unknown keys (REQ-CONFIG-233) is asserted where the warnings are observable, in
// `packages/config/src/display-section.test.ts`; the load's warnings do not reach this process's log.
results.falsifiedKeys = { result: fResult, input: fInput, govern: false };

// ── 7. The run-start mode hint, unfollowed and on a released session (REQ-ORCH-152, PD-ORCH-003) ─────────────
// A workspace and a profile of its own, so the earlier launches' session and file do not decide what is followed. The
// mode is `plan`, and code intelligence is off because its discovery costs seconds of every run start (the plan gate
// proof's fixture, for the same reason).
const runStart = join(output, 'run-start');
const rsWorkspace = join(runStart, 'workspace');
const rsLocal = join(runStart, 'local');
const rsPreferences = join(runStart, 'preferences');
mkdirSync(join(rsWorkspace, '.rotaris'), { recursive: true });
mkdirSync(rsLocal, { recursive: true });
writeFileSync(join(rsWorkspace, 'README.md'), '# run-start hint workspace\n');
writeFileSync(join(rsWorkspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous', '  run_start_mode: plan', '  max_iterations: 3',
  'mcp_servers:', '  code_intelligence: { enabled: false }', '',
].join('\n'));
const hintOf = (probes) => first(probes, '[data-testid="run-start-hint"]');
/** The latest session of the run-start workspace, read after the process that wrote it has exited. */
function runStartSession() {
  const db = new Database(oneDatabase(rsLocal), { readonly: true });
  try { return db.prepare('SELECT execution_status, plan_cycle, plan_released FROM sessions ORDER BY created_at DESC LIMIT 1').get() ?? null; } finally { db.close(); }
}

// 7a. No session followed: what `plan` does, and nothing about a release.
const unfollowed = await launch('run-start-unfollowed', rsWorkspace, rsLocal, rsPreferences, { ...openCategory('Runtime'), ROTARIS_CAPTURE_AFTER_MS: '2600' });
const plainHint = hintOf(unfollowed.probes);
if (!plainHint) throw new Error('the Runtime category drew no run-start mode hint');
if (/not built/i.test(plainHint.text)) throw new Error(`the hint still says the plan gate is not built: "${plainHint.text}"`);
if (!/plan gate/.test(plainHint.text) || !/next run/.test(plainHint.text)) throw new Error(`the hint does not say what plan does: "${plainHint.text}"`);
if (plainHint.data['data-released'] !== 'false' || /released/.test(plainHint.text)) throw new Error(`with no session followed the hint spoke of a release: "${plainHint.text}"`);

// 7b. A prompt held at the gate. The wait is a DEADLINE for the gate's plan, not an appointment (plan-gate-proof's rule).
await launch('run-start-held', rsWorkspace, rsLocal, rsPreferences, {
  ROTARIS_CAPTURE_PROMPT: 'create planned.txt with the word done in it',
  ROTARIS_CAPTURE_WAIT: 'js:document.querySelector(\'[data-testid="plan-gate-plan"]\') !== null',
  ROTARIS_CAPTURE_WAIT_MS: '60000',
  ROTARIS_CAPTURE_AFTER_MS: '1500',
}, 120_000);
const held = runStartSession();
if (held?.execution_status !== 'awaiting_plan_decision') throw new Error(`the run-start workspace's prompt was not held at the gate: ${JSON.stringify(held)}`);

// 7c. Approve: the session now holds a release (PD-ORCH-003), which is the state the hint must name.
await launch('run-start-approved', rsWorkspace, rsLocal, rsPreferences, {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="plan-approve"]@6000',
  ROTARIS_CAPTURE_AFTER_MS: '30000',
}, 180_000);
const approvedSession = runStartSession();
if (approvedSession?.plan_released !== 1) throw new Error(`approval did not release the session, so the released hint cannot be measured: ${JSON.stringify(approvedSession)}`);

// 7d. The approved session followed, Settings open on Runtime: the hint states the release and the re-arming control.
const released = await launch('run-start-released', rsWorkspace, rsLocal, rsPreferences, {
  ROTARIS_CAPTURE_RESUME: 'latest',
  ...openCategory('Runtime', 3000),
  ROTARIS_CAPTURE_AFTER_MS: '5000',
});
const releasedHint = hintOf(released.probes);
if (!releasedHint) throw new Error('the Runtime category drew no run-start mode hint over the released session');
if (releasedHint.data['data-released'] !== 'true') throw new Error(`the followed session holds a release and the hint did not say so: ${JSON.stringify(releasedHint)}`);
if (/not built/i.test(releasedHint.text)) throw new Error(`the hint still says the plan gate is not built: "${releasedHint.text}"`);
if (!/This session is released/.test(releasedHint.text)) throw new Error(`the hint does not state that the session is released: "${releasedHint.text}"`);
if (!/Plan first/.test(releasedHint.text) || !/run-start control/.test(releasedHint.text)) throw new Error(`the hint does not name the control that re-arms the session: "${releasedHint.text}"`);
// The selector still reads `plan`: an approval never writes the setting (PD-ORCH-003).
if (!/run_start_mode: plan/.test(readFileSync(join(rsWorkspace, '.rotaris', 'agents.yaml'), 'utf8'))) throw new Error('the approval wrote the run-start mode');
results.runStartHint = {
  unfollowed: { released: plainHint.data['data-released'], text: plainHint.text },
  session: { held: held.execution_status, released: approvedSession.plan_released },
  released: { released: releasedHint.data['data-released'], text: releasedHint.text },
};

// ── 8. The Personas Scope column: a pending Unset, and the name it is announced by (REQ-CONFIG-341) ───────────
// A workspace whose file sets only `personas.tester.model`, so `tester` alone reads `model: workspace` and offers Unset at
// the Workspace scope. The Unset is found by the accessible name REQ-CONFIG-341 gives it (field and role), clicked, and the
// cell read while the unset is pending (`default`, no Unset) and after Discard (`workspace` and its Unset again)
// (docs/defects/fixed/the-scope-columns-unset-leaves-the-field-reading-its-old-origin.md,
// docs/defects/fixed/the-scope-columns-unset-is-named-unset-and-nothing-else.md).
const personasRoot = join(output, 'personas');
const pWorkspace = join(personasRoot, 'workspace');
const pLocal = join(personasRoot, 'local');
const pPreferences = join(personasRoot, 'preferences');
mkdirSync(join(pWorkspace, '.rotaris'), { recursive: true });
mkdirSync(pLocal, { recursive: true });
writeFileSync(join(pWorkspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'personas:', '  tester:', '    model: large_model', '',
].join('\n'));
const UNSET_MODEL = '.settings__scope button[aria-label="Unset model for tester"]';
const UNSET_ANY = '.settings__scope button';
const personas = await launch('personas-unset', pWorkspace, pLocal, pPreferences, {
  ...openCategory('Personas'),
  ROTARIS_CAPTURE_PROBE_AT: [
    `.settings__scope@2400`, `${UNSET_MODEL}@2400`, `${UNSET_ANY}@2400`,
    `.settings__scope@4000`, `${UNSET_ANY}@4000`, `.save-bar__status@4000`,
  ].join(';;'),
  ROTARIS_CAPTURE_CLICKS: `${UNSET_MODEL}@3000;;.save-bar .btn-secondary>>Discard@4600`,
  ROTARIS_CAPTURE_PROBE: [...PROBES, '.settings__scope', UNSET_MODEL, UNSET_ANY].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
const probedAt = (ms, selector) => JSON.parse(new RegExp(`probe-at ${ms} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`).exec(personas.log)?.[1] ?? 'null');
const beforeCells = probedAt(2400, '.settings__scope');
if (!beforeCells) throw new Error('the Personas category drew no Scope column');
const beforeTester = beforeCells.filter((c) => c.text.startsWith('model: workspace'));
if (beforeTester.length !== 1 || !beforeTester[0].text.includes('Unset')) throw new Error(`before the click no row read "model: workspace" with Unset: ${JSON.stringify(beforeCells.map((c) => c.text))}`);
// REQ-CONFIG-341: the Unset's accessible name identifies the field and the role. The one Unset on screen is found by it.
const named = probedAt(2400, UNSET_MODEL) ?? [];
const allUnset = probedAt(2400, UNSET_ANY) ?? [];
if (named.length !== 1 || allUnset.length !== 1) throw new Error(`the tester's model Unset was not named "Unset model for tester": ${named.length} named of ${allUnset.length} Unset`);
if (!personas.log.includes(`capture: clicked "${UNSET_MODEL}"`)) throw new Error('the Unset named for the tester\'s model was not clicked');
// REQ-CONFIG-341: the click marks the field's origin as `default`; `default` offers no Unset.
// Each pending reading needs a probe that ran and found the column: a missing or empty probe is no evidence.
const pendingCells = probedAt(4000, '.settings__scope');
if (!pendingCells || pendingCells.length !== beforeCells.length) throw new Error(`with the unset pending the Scope column was not read row for row: ${pendingCells?.length ?? 'no probe'} cells of ${beforeCells.length}`);
if (pendingCells.some((c) => c.text.startsWith('model: workspace'))) throw new Error(`with the unset pending a row still read its old origin: ${JSON.stringify(pendingCells.map((c) => c.text))}`);
const modelDefault = (cells) => cells.filter((c) => c.text.startsWith('model: default')).length;
if (modelDefault(pendingCells) !== modelDefault(beforeCells) + 1) throw new Error(`with the unset pending the tester's model did not read "default": ${modelDefault(beforeCells)} rows read it before, ${modelDefault(pendingCells)} after`);
const pendingUnset = probedAt(4000, UNSET_ANY);
if (pendingUnset === null) throw new Error('the pending Scope column\'s Unset was never probed');
if (pendingUnset.length !== 0) throw new Error('with the unset pending the Scope column still offered Unset');
if (!(probedAt(4000, '.save-bar__status') ?? []).some((c) => c.text === 'Unsaved changes')) throw new Error('the pending unset did not dirty the form');
// REQ-CONFIG-341: Discard restores the previous values, and with them the origin and its Unset.
const discarded = rows(personas.probes, '.settings__scope').filter((c) => c.text.startsWith('model: workspace'));
if (discarded.length !== 1 || !discarded[0].text.includes('Unset')) throw new Error(`after Discard the tester's model did not read "workspace" with Unset: ${JSON.stringify(rows(personas.probes, '.settings__scope').map((c) => c.text))}`);
if (rows(personas.probes, UNSET_MODEL).length !== 1) throw new Error('after Discard the Unset was not named for the tester\'s model');
if ((text(personas.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error('Discard did not leave the form clean');
results.personasUnset = {
  before: { cell: beforeTester[0].text, unsetName: 'Unset model for tester' },
  pending: { rows: pendingCells.length, testerReadsOldOrigin: false, modelDefaultRows: `${modelDefault(beforeCells)} → ${modelDefault(pendingCells)}`, unsetOffered: 0, status: 'Unsaved changes' },
  discarded: { cell: discarded[0].text, unsetName: 'Unset model for tester', status: 'All changes saved' },
};

// ── 9. One role's edits at two scopes, saved each at its own (REQ-CONFIG-259, REQ-CONFIG-341) ──────────────────
// A workspace whose file sets `personas.tester.model`, under a global file that sets `personas.tester.thinking`, so the
// tester reads `model: workspace` and `reasoning: global`. With Workspace selected the model's Unset is clicked; the edit
// scope is switched to Global and the reasoning's Unset is clicked; Save. Each unset must land in the file it was made
// in: until 2026-10-02 the role's pending entry held one scope, both unsets were saved at Global, the global layer was
// asked to unset a model it did not hold, and the workspace's model stayed
// (docs/defects/fixed/a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md).
const twoRoot = join(output, 'personas-two-scopes');
const tWorkspace = join(twoRoot, 'workspace');
const tLocal = join(twoRoot, 'local');
const tPreferences = join(twoRoot, 'preferences');
// The global scope of a launch isolated at `tLocal`, by the harness's one rule for every platform (REQ-CONFIG-001).
const tGlobalDir = configDirFor(tLocal);
mkdirSync(join(tWorkspace, '.rotaris'), { recursive: true });
mkdirSync(tGlobalDir, { recursive: true });
const tWorkspaceFile = join(tWorkspace, '.rotaris', 'agents.yaml');
const tGlobalFile = join(tGlobalDir, 'agents.yaml');
writeFileSync(tWorkspaceFile, [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'personas:', '  tester:', '    model: large_model', '',
].join('\n'));
writeFileSync(tGlobalFile, ['# the global scope, written by the proof script', 'personas:', '  tester:', '    model: small_model', '    thinking: high', ''].join('\n'));
const UNSET_REASONING = '.settings__scope button[aria-label="Unset reasoning for tester"]';
const twoScopes = await launch('personas-two-scopes', tWorkspace, tLocal, tPreferences, {
  ...openCategory('Personas'),
  ROTARIS_CAPTURE_PROBE_AT: [`.settings__scope@2400`, `${UNSET_MODEL}@2400`, `${UNSET_REASONING}@4800`, `.settings__scope@5400`, `.save-bar__status@5400`].join(';;'),
  ROTARIS_CAPTURE_SELECT: '[aria-label="Edit scope"]>>global@3800',
  ROTARIS_CAPTURE_CLICKS: `${UNSET_MODEL}@3000;;${UNSET_REASONING}@4600;;.save-bar .btn-primary>>Save@6000`,
  ROTARIS_CAPTURE_PROBE: [...PROBES, '.settings__scope'].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '8000',
});
const twoAt = (ms, selector) => JSON.parse(new RegExp(`probe-at ${ms} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`).exec(twoScopes.log)?.[1] ?? 'null');
const twoBefore = (twoAt(2400, '.settings__scope') ?? []).find((c) => c.text.startsWith('model: workspace'));
if (!twoBefore || !/reasoning: global/.test(twoBefore.text)) throw new Error(`the tester did not read a workspace model and a global reasoning level before the edits: ${JSON.stringify((twoAt(2400, '.settings__scope') ?? []).map((c) => c.text))}`);
if ((twoAt(2400, UNSET_MODEL) ?? []).length !== 1) throw new Error('the tester\'s model Unset was not offered at Workspace');
if ((twoAt(4800, UNSET_REASONING) ?? []).length !== 0) throw new Error('the tester\'s reasoning Unset was still offered after it was clicked at Global');
if (!twoScopes.log.includes(`capture: clicked "${UNSET_MODEL}"`) || !twoScopes.log.includes(`capture: clicked "${UNSET_REASONING}"`)) throw new Error(`the two Unsets were not both clicked:\n${twoScopes.log.split('\n').filter((l) => /capture: (clicked|select)/.test(l)).join('\n')}`);
if (!(twoAt(5400, '.save-bar__status') ?? []).some((c) => c.text === 'Unsaved changes')) throw new Error('the two pending unsets did not dirty the form');
const wsAfter = readFileSync(tWorkspaceFile, 'utf8');
const globalAfter = readFileSync(tGlobalFile, 'utf8');
// REQ-CONFIG-259/341: the model's unset at the workspace removed the workspace's model; the reasoning's at the global
// layer removed the global reasoning and left the global model, which nobody touched.
if (/tester:/.test(wsAfter)) throw new Error(`the model unset made at Workspace did not reach the workspace file:\n${wsAfter}`);
if (/thinking:/.test(globalAfter)) throw new Error(`the reasoning unset made at Global did not reach the global file:\n${globalAfter}`);
if (!/tester:\n {4}model: small_model\n/.test(globalAfter)) throw new Error(`the global file lost the tester's model, which was never unset at Global:\n${globalAfter}`);
if ((text(twoScopes.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error('the save did not leave the form clean');
const twoAfter = rows(twoScopes.probes, '.settings__scope').find((c) => c.text.startsWith('model: global'));
if (!twoAfter || !/reasoning: default/.test(twoAfter.text)) throw new Error(`after the save the tester did not read the global model and the default reasoning: ${JSON.stringify(rows(twoScopes.probes, '.settings__scope').map((c) => c.text))}`);
results.personasTwoScopes = {
  before: twoBefore.text,
  after: twoAfter.text,
  workspaceFile: wsAfter.includes('personas') ? 'personas left' : 'personas removed',
  globalFile: globalAfter.trim().split('\n').slice(1).join(' / '),
};

// ── 10. One field's edits at both scopes, both saved (REQ-CONFIG-341, REQ-MONITOR-149) ────────────────────────────
// The tester's model is set in both files, so it reads `model: workspace`. With Workspace selected the model's Unset is
// clicked; the edit scope is switched to Global and a model is picked there for the same role; Save. REQ-CONFIG-341
// records "a pending unset of (role, field, scope)", so the workspace unset must survive the global pick: the first
// repair held one scope per field, the global pick replaced the workspace unset, and the override the user cleared
// stayed in the workspace file, shadowing the pick (the verifier's finding on 2026-10-02).
const sameRoot = join(output, 'personas-one-field-two-scopes');
const sWorkspace = join(sameRoot, 'workspace');
const sLocal = join(sameRoot, 'local');
const sPreferences = join(sameRoot, 'preferences');
const sGlobalDir = configDirFor(sLocal);
mkdirSync(join(sWorkspace, '.rotaris'), { recursive: true });
mkdirSync(sGlobalDir, { recursive: true });
const sWorkspaceFile = join(sWorkspace, '.rotaris', 'agents.yaml');
const sGlobalFile = join(sGlobalDir, 'agents.yaml');
writeFileSync(sWorkspaceFile, [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'personas:', '  tester:', '    model: large_model', '',
].join('\n'));
writeFileSync(sGlobalFile, ['# the global scope, written by the proof script', 'personas:', '  tester:', '    model: small_model', ''].join('\n'));
const oneField = await launch('personas-one-field-two-scopes', sWorkspace, sLocal, sPreferences, {
  ...openCategory('Personas'),
  ROTARIS_CAPTURE_PROBE_AT: [`.settings__scope@2400`, `${UNSET_MODEL}@2400`, `.settings__scope@5400`, `.save-bar__status@5400`].join(';;'),
  ROTARIS_CAPTURE_SELECT: '[aria-label="Edit scope"]>>global@3800;;[aria-label="Model for tester"]>>medium_model@4600',
  ROTARIS_CAPTURE_CLICKS: `${UNSET_MODEL}@3000;;.save-bar .btn-primary>>Save@6000`,
  ROTARIS_CAPTURE_PROBE: [...PROBES, '.settings__scope'].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '8000',
});
const oneAt = (ms, selector) => JSON.parse(new RegExp(`probe-at ${ms} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`).exec(oneField.log)?.[1] ?? 'null');
const oneBefore = (oneAt(2400, '.settings__scope') ?? []).find((c) => c.text.startsWith('model: workspace'));
if (!oneBefore) throw new Error(`the tester did not read a workspace model before the edits: ${JSON.stringify((oneAt(2400, '.settings__scope') ?? []).map((c) => c.text))}`);
if ((oneAt(2400, UNSET_MODEL) ?? []).length !== 1) throw new Error('the tester\'s model Unset was not offered at Workspace');
if (!oneField.log.includes(`capture: clicked "${UNSET_MODEL}"`)) throw new Error('the model Unset was not clicked');
if (!/capture: select \[aria-label="Model for tester"\] = medium_model → chosen/.test(oneField.log)) throw new Error(`the model was not picked at Global:\n${oneField.log.split('\n').filter((l) => /capture: (clicked|select)/.test(l)).join('\n')}`);
if (!(oneAt(5400, '.save-bar__status') ?? []).some((c) => c.text === 'Unsaved changes')) throw new Error('the two pending edits did not dirty the form');
const sWsAfter = readFileSync(sWorkspaceFile, 'utf8');
const sGlobalAfter = readFileSync(sGlobalFile, 'utf8');
// REQ-CONFIG-341/MONITOR-149: the unset at the workspace cleared the workspace's override, and the pick at Global landed there.
if (/tester:/.test(sWsAfter)) throw new Error(`the model unset made at Workspace did not survive the model picked at Global; the workspace file still holds the override:\n${sWsAfter}`);
if (!/tester:\n {4}model: medium_model\n/.test(sGlobalAfter)) throw new Error(`the model picked at Global did not reach the global file:\n${sGlobalAfter}`);
if ((text(oneField.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error('the save did not leave the form clean');
const oneAfter = rows(oneField.probes, '.settings__scope').find((c) => c.text.startsWith('model: global'));
if (!oneAfter) throw new Error(`after the save the tester did not read the global model: ${JSON.stringify(rows(oneField.probes, '.settings__scope').map((c) => c.text))}`);
results.personasOneFieldTwoScopes = {
  before: oneBefore.text,
  after: oneAfter.text,
  workspaceFile: sWsAfter.includes('personas') ? 'personas left' : 'personas removed',
  globalFile: sGlobalAfter.trim().split('\n').slice(1).join(' / '),
};

// ── 11. A reload from elsewhere leaves a clean form clean, and keeps a real edit (REQ-CONFIG-419, REQ-SHELL-041) ──
// The memory-diagnostics switch (REQ-CONFIG-471) is the one Settings control that writes the file at once; main then
// announces the reloaded snapshot to this window exactly as it does after a sign-in (`config.setField` → `announce`),
// and the screen adopts it keeping its pending state. The live run at 1763f7f found that adoption reading as dirty
// with nothing edited (sign-in.png: "unsaved settings"), because the rebased state held its keys in another order.
const reloadRoot = join(output, 'reload-clean');
const rWorkspace = join(reloadRoot, 'workspace');
const rLocal = join(reloadRoot, 'local');
const rPreferences = join(reloadRoot, 'preferences');
mkdirSync(join(rWorkspace, '.rotaris'), { recursive: true });
mkdirSync(rLocal, { recursive: true });
const rConfig = join(rWorkspace, '.rotaris', 'agents.yaml');
writeFileSync(rConfig, [
  '# scratch configuration written by the proof script',
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', '',
].join('\n'));
const DIAGNOSTICS = '[aria-labelledby="diagnostics-label"]';
const DIAGNOSTICS_ON = `.toggle.is-on${DIAGNOSTICS}`;
const BREAKER_ON = '.toggle.is-on[aria-labelledby="cb-label"]';
const STRIP_UNSAVED = '[data-testid="strip-unsaved"]';
const reloadProbes = [STRIP_UNSAVED, '.save-bar__status', DIAGNOSTICS_ON, BREAKER_ON];
const reload = await launch('reload-clean', rWorkspace, rLocal, rPreferences, {
  ...openCategory('Runtime'),
  ROTARIS_CAPTURE_PROBE_AT: [2000, 4000, 6000, 8000].flatMap((ms) => reloadProbes.map((sel) => `${sel}@${ms}`)).join(';;'),
  // 2400: the switch on, nothing edited. 4400: a real edit (the breaker off). 6400: the switch off again, with the edit pending.
  ROTARIS_CAPTURE_CLICKS: `${DIAGNOSTICS}@2400;;[aria-labelledby="cb-label"]@4400;;${DIAGNOSTICS}@6400`,
  ROTARIS_CAPTURE_PROBE: [...PROBES, ...reloadProbes].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '9000',
});
const reloadAt = (ms, selector) => JSON.parse(new RegExp(`probe-at ${ms} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`).exec(reload.log)?.[1] ?? 'null');
const reading = (ms) => {
  const read = Object.fromEntries(reloadProbes.map((sel) => [sel, reloadAt(ms, sel)]));
  const missing = reloadProbes.filter((sel) => read[sel] === null);
  if (missing.length > 0) throw new Error(`reload-clean: the probes at ${ms} ms did not run: ${missing.join(', ')}`);
  return { unsavedFlag: read[STRIP_UNSAVED].length > 0, status: read['.save-bar__status'][0]?.text ?? '', diagnostics: read[DIAGNOSTICS_ON].length > 0, breaker: read[BREAKER_ON].length > 0 };
};
const fieldWrites = reload.log.split('\n').filter((l) => l.includes('configuration field written for')).length;
if (fieldWrites !== 2) throw new Error(`reload-clean: the switch wrote the file ${fieldWrites} times, not twice, so the reload path was not driven (see reload-clean.log)`);
const r0 = reading(2000);
const r1 = reading(4000);
const r2 = reading(6000);
const r3 = reading(8000);
if (r0.unsavedFlag || r0.status !== 'All changes saved' || r0.diagnostics) throw new Error(`reload-clean: the form did not open clean with the switch off: ${JSON.stringify(r0)}`);
// The change arrived (the switch reads on from the reloaded snapshot), and nothing was edited: clean, no flag.
if (!r1.diagnostics) throw new Error(`reload-clean: the reloaded snapshot never reached the screen: ${JSON.stringify(r1)}`);
if (r1.unsavedFlag || r1.status !== 'All changes saved') throw new Error(`reload-clean: a reload with no edit marked the form dirty (REQ-CONFIG-419, REQ-SHELL-041): ${JSON.stringify(r1)}`);
// A real edit is dirty, and stays dirty and kept across a second reload.
if (!r2.unsavedFlag || r2.status !== 'Unsaved changes' || r2.breaker) throw new Error(`reload-clean: the breaker edit did not dirty the form: ${JSON.stringify(r2)}`);
if (r3.diagnostics) throw new Error(`reload-clean: the second reload never reached the screen: ${JSON.stringify(r3)}`);
if (!r3.unsavedFlag || r3.status !== 'Unsaved changes' || r3.breaker) throw new Error(`reload-clean: the second reload dropped the pending edit or its flag: ${JSON.stringify(r3)}`);
const rYaml = readFileSync(rConfig, 'utf8');
if (!/memory_diagnostics_enabled: false/.test(rYaml) || /circuit_breaker/.test(rYaml)) throw new Error(`reload-clean: the file is not the switch's alone:\n${rYaml}`);
results.reloadClean = { opened: r0, afterReloadNoEdit: r1, afterEdit: r2, afterReloadWithEdit: r3, fieldWrites };

// ── 11′. Two reloads in one tick stay clean, and a permission mode written elsewhere wins (REQ-CONFIG-419, REQ-CONFIG-423) ──
// Launch 11 spaces its writes seconds apart, so the hook's saved state has always settled between them. Here the capture's
// pair seam makes two real writes of the circuit breaker (off, then on again) and hands the window both announcements in
// one tick: the unrepaired hook rebased the second against the saved state from before the first, kept the first's `off`
// as an edit and read dirty (`docs/defects/fixed/two-quick-configuration-reloads-mark-settings-unsaved.md`). Then the
// user picks `restricted` here and does not save, and the composer's write path (`config.setField` of the permission mode
// alone, REQ-CONFIG-288) writes `autonomous`: for this one field the last write wins over the unsaved selection, so the
// control shows `autonomous` and, nothing else being edited, the form is clean
// (`docs/defects/fixed/a-permission-mode-written-elsewhere-loses-to-an-unsaved-settings-selection.md`).
const MODE_GROUP = '[aria-label="Permission mode, strictest first"]';
const MODE_ACTIVE = `${MODE_GROUP} .seg-opt.is-active`;
const lastProbes = [STRIP_UNSAVED, '.save-bar__status', BREAKER_ON, MODE_ACTIVE];
const lastWrite = await launch('reload-last-write', rWorkspace, rLocal, rPreferences, {
  ...openCategory('Runtime'),
  ROTARIS_CAPTURE_PROBE_AT: [2000, 3400, 4600, 6000].flatMap((ms) => lastProbes.map((sel) => `${sel}@${ms}`)).join(';;'),
  // 2400: the pair of writes, announced together. 3800: `restricted` picked here, unsaved. 5000: the composer's write.
  ROTARIS_CAPTURE_CONFIG_PAIR_AT: '{"circuit_breaker":{"enabled":false}}>>{"circuit_breaker":{"enabled":true}}@2400',
  ROTARIS_CAPTURE_CLICKS: `${MODE_GROUP} [role="radio"]:nth-child(1)@3800`,
  ROTARIS_CAPTURE_EVAL_AT: `window.rotaris.command({ kind: 'config.setField', patch: { runtime: { permission_mode: 'autonomous' } } }).then((r) => r.ok)@5000`,
  ROTARIS_CAPTURE_PROBE: [...PROBES, ...lastProbes].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '7000',
});
const lastAt = (ms, selector) => JSON.parse(new RegExp(`probe-at ${ms} ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])`).exec(lastWrite.log)?.[1] ?? 'null');
const lastReading = (ms) => {
  const read = Object.fromEntries(lastProbes.map((sel) => [sel, lastAt(ms, sel)]));
  const missing = lastProbes.filter((sel) => read[sel] === null);
  if (missing.length > 0) throw new Error(`reload-last-write: the probes at ${ms} ms did not run: ${missing.join(', ')}`);
  return { unsavedFlag: read[STRIP_UNSAVED].length > 0, status: read['.save-bar__status'][0]?.text ?? '', breaker: read[BREAKER_ON].length > 0, mode: read[MODE_ACTIVE][0]?.text ?? '' };
};
const pairLine = /capture: config-pair-at 2400 → (.*)$/m.exec(lastWrite.log)?.[1] ?? '';
if (pairLine !== 'writes [true,true], 2 announcements delivered in one tick') throw new Error(`reload-last-write: the pair seam did not deliver two written announcements together: "${pairLine}" (see reload-last-write.log)`);
const composerWrite = /capture: eval-at 5000 .* → (.*)$/m.exec(lastWrite.log)?.[1] ?? '';
if (composerWrite !== 'true') throw new Error(`reload-last-write: the composer's permission-mode write was refused: ${composerWrite} (see reload-last-write.log)`);
const l0 = lastReading(2000);
const l1 = lastReading(3400);
const l2 = lastReading(4600);
const l3 = lastReading(6000);
if (l0.unsavedFlag || l0.status !== 'All changes saved' || !l0.breaker || l0.mode === '' || l0.mode === 'restricted' || l0.mode === 'autonomous') throw new Error(`reload-last-write: the form did not open clean, breaker on, on a mode the steps can move: ${JSON.stringify(l0)}`);
if (l1.unsavedFlag || l1.status !== 'All changes saved' || !l1.breaker) throw new Error(`reload-last-write: two reloads in one tick marked the form dirty or left the first write's value on screen (REQ-CONFIG-419, REQ-SHELL-041): ${JSON.stringify(l1)}`);
if (!l2.unsavedFlag || l2.status !== 'Unsaved changes' || l2.mode !== 'restricted') throw new Error(`reload-last-write: the unsaved selection of restricted did not take: ${JSON.stringify(l2)}`);
if (l3.mode !== 'autonomous') throw new Error(`reload-last-write: the unsaved selection outlived a permission mode written elsewhere (REQ-CONFIG-423): ${JSON.stringify(l3)}`);
if (l3.unsavedFlag || l3.status !== 'All changes saved') throw new Error(`reload-last-write: the displaced selection still reads as an edit (REQ-CONFIG-419, REQ-CONFIG-423): ${JSON.stringify(l3)}`);
const lYaml = readFileSync(rConfig, 'utf8');
if (!/permission_mode: autonomous/.test(lYaml) || !/enabled: true/.test(lYaml)) throw new Error(`reload-last-write: the file does not hold the two writes' outcome:\n${lYaml}`);
results.reloadLastWrite = { opened: l0, afterPairInOneTick: l1, afterUnsavedSelection: l2, afterWriteElsewhere: l3, pair: pairLine };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\nsettings proof: evidence under ${relative(repo, output)}`);
