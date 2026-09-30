/**
 * The portable-skills proof (ADR-0063; REQ-WORKSPACE-051..069, 072, 073, 151).
 *
 * Six launches against the built product, with a scratch profile **and a scratch home directory**, so the
 * user-scope roots and the disable manifest are fixtures rather than whatever this machine happens to hold.
 * User-scope discovery reads that home through the `ROTARIS_CAPTURE_SKILLS_HOME` seam on every platform, not through
 * `HOME`/`USERPROFILE`: overriding those kills Electron before it paints on Windows (see `launch`). Off Windows the
 * launch's `HOME` is the same scratch home too, because `proofIsolationEnv` sets it on every POSIX launch. The
 * machine-wide root, `/etc/codex/skills` (REQ-WORKSPACE-051, off Windows only), is a fixture too: it is redirected
 * into the scratch tree by `ROTARIS_CAPTURE_SKILLS_MACHINE` and holds one skill there, so the seam is exercised in
 * the built app on every host that has an `/etc` hierarchy and the operator's own `/etc/codex` is never read.
 *
 *   1. discover   — a workspace inside a git repository with project, repository and user-scope skills, a
 *                   shadowed duplicate, an invalid file, a disabled one and a name that collides with a
 *                   built-in command. The table's rows, sources, elided paths, shadow tooltip and skipped
 *                   list; the composer's popup and the suffixed command.
 *   2. policy     — the selectors and the switch move, the form goes dirty, Save writes `skills:` sparsely,
 *                   and a baseline chosen over a global override is written out explicitly (REQ-CONFIG-258).
 *   3. reopen     — the same profile again: the saved policy is what the selectors show, the form is clean.
 *   4. run        — a scripted run: the run host logs the context units at agent construction, the skill
 *                   directories are read roots, and the catalog block carries no body.
 *   5. rescan     — a SKILL.md added mid-session appears on Rescan, with the form still clean; the chooser's
 *                   dismissal changes nothing and a bad path reports REQ-WORKSPACE-057's own sentence.
 *   6. disabled   — `skills.enabled: false`: no catalog unit, nothing invocable, the switch off.
 *
 * REQ-CHAT-162's `/skills` (first-release-plan §2.2) adds two launches after the commands launch, before the policy
 * launch changes anything the listing reads:
 *
 *   1c. listing        — `/skills` typed into a session's composer: ONE system row drawn as the listing, carrying
 *                        per skill the normalized name, the scope, the triggers, the description and the path, and
 *                        the count; no in-context indicator anywhere (ESC-37); a bare URL in a description drawn as
 *                        a link (REQ-CHAT-076). The run host logs the row it wrote.
 *   1d. listing-reopen — the same session reopened from the session browser in a new launch: the row is still
 *                        there, read back from the store, and nothing was listed again.
 *
 * Evidence under `.proof/skills-proof/`: one PNG and one log per launch, plus `results.json`.
 * `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, buildDesktop, configDirFor, electron, evidenceDirectory, hostSwitches, launchOptions, readProbes, repo } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

const output = evidenceDirectory('skills-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const PROBES = [
  '.app-shell',
  '[data-testid="skill-row"]',
  '[data-testid="skill-skipped"]',
  '[data-testid="skills-empty"]',
  '[data-testid="skills-message"]',
  '[data-testid="skills-enabled"]',
  '[data-testid="skill-commands"]',
  '[data-testid="prompt-commands"]',
  '[data-testid="transcript-clear"]',
  '.save-bar__status',
  '.slash-popup__row',
  // REQ-CHAT-162: the listing as the one row renderer draws it, inside the system notice that carries it.
  '[data-testid="row-system"] [data-testid="skill-listing"]',
  '[data-testid="skill-listing-entry"]',
  '[data-testid="skill-listing-entry"] .md__link',
];

const results = [];
const fail = (message) => { writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2)); throw new Error(message); };

async function launch(name, workspace, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const args = [join(app, 'out', 'main', 'index.js'), ...hostSwitches];
  if (workspace !== null) args.push(workspace);
  const result = await spawnBounded(electron, args, {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...launchOptions({ local: scratch.local, preferences: scratch.preferences }),
      /*
       * The scratch home for user-scope discovery, so this proof exercises `~/.agents/skills` and the OpenHands
       * manifest without reading the operator's own skills.
       *
       * It is a capture seam rather than an override of `HOME`/`USERPROFILE`: **overriding those kills the
       * Electron process before it paints** on Windows. Measured on this proof's first run — the launch exited
       * 0x80000003 two log lines in, and a control run with the same environment minus those two variables
       * exited 0. The seam is read only by the run host's skill host and only when it is set.
       */
      ROTARIS_CAPTURE_SKILLS_HOME: scratch.home,
      /*
       * The scratch machine-wide directory: the fourth user-scope skill root is its `skills` child, and PD-WORKSPACE-002's
       * machine-wide instruction base is the directory itself, so the run host reads neither from the machine's own
       * `/etc/codex`. The instruction seam names the same directory because the workspace service's inventory reads only
       * that one, so no process of any launch here reads the machine's own. Both compiled out of a packaged build; inert
       * on Windows, where the product declares no such root.
       */
      ROTARIS_CAPTURE_SKILLS_MACHINE: scratch.machine,
      ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE: scratch.machine,
      ROTARIS_CAPTURE_PNG: png,
      ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) fail(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) fail(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) fail(`${name} produced no screenshot`);
  return { log, probes: readProbes(log) };
}

const rows = (probes, selector) => probes[selector] ?? [];
/** One Settings category opened by its rail label, after the view switch settles. */
const openSkills = (extra = {}) => ({ ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: '900', ROTARIS_CAPTURE_SETTINGS: 'Skills', ...extra });

// ── The fixture tree ────────────────────────────────────────────────────────────────────────────────
const scratch = {
  base: join(output, 'scratch'),
  local: join(output, 'scratch', 'local'),
  preferences: join(output, 'scratch', 'prefs'),
  home: join(output, 'scratch', 'home'),
  machine: join(output, 'scratch', 'machine-codex'),
  repoRoot: join(output, 'scratch', 'repo'),
};
/** The platform rule the product applies to the machine-wide root (`hasEtcHierarchy`): every platform but Windows. */
const hasMachineRoot = process.platform !== 'win32';
const workspace = join(scratch.repoRoot, 'project');
const skill = (name, description, extra = '') => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${name.toUpperCase().replace(/[^A-Z]/g, '_')}_BODY\n`;
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

for (const dir of [scratch.local, scratch.preferences, scratch.home, scratch.machine, workspace]) mkdirSync(dir, { recursive: true });
// A `.git` FILE, not a directory — the linked-worktree shape REQ-WORKSPACE-051 names, and the one this
// repository's own proofs run under.
write(join(scratch.repoRoot, '.git'), 'gitdir: /elsewhere/.git/worktrees/repo\n');
write(join(scratch.repoRoot, '.agents', 'skills', 'repo-wide', 'SKILL.md'), skill('repo-wide', 'A skill the whole repository offers.'));
write(join(workspace, '.agents', 'skills', 'ws-skill', 'SKILL.md'), skill('ws-skill', 'The workspace skill.', 'trigger:\n  type: keyword\n  keywords: [render, "/pdf"]\n'));
// The same normalized name in a lower-priority layout: the workspace's `.agents` must win and record it.
write(join(workspace, '.opencode', 'skills', 'ws-skill', 'SKILL.md'), skill('ws-skill', 'The shadowed duplicate.'));
write(join(workspace, '.agents', 'skills', 'broken', 'SKILL.md'), 'no frontmatter at all\n');
// REQ-SHELL-056: a declared name colliding with the built-in `/stop`.
write(join(workspace, '.agents', 'skills', 'stop', 'SKILL.md'), skill('stop', 'A skill whose name a built-in holds.'));
// REQ-WORKSPACE-056: `user-invocable: false` is auto-only — in the catalog, never a command.
write(join(workspace, '.agents', 'skills', 'auto-only', 'SKILL.md'), skill('auto-only', 'Model-facing only.', 'user-invocable: false\n'));
// A bare URL in a description, ending a sentence: REQ-CHAT-076 makes it activatable in any row's text, the `/skills`
// listing's included, with the trailing full stop left out of the target (launch 1c).
write(join(scratch.home, '.agents', 'skills', 'home-skill', 'SKILL.md'), skill('home-skill', 'A skill from the user scope, see https://skills-proof.invalid/home-skill.'));
write(join(scratch.home, '.openhands', 'skills', 'installed', 'kept', 'SKILL.md'), skill('kept', 'An installed skill that stays.'));
write(join(scratch.home, '.openhands', 'skills', 'installed', 'dropped', 'SKILL.md'), skill('dropped', 'An installed skill the manifest disables.'));
write(join(scratch.home, '.openhands', 'skills', '.installed.json'), JSON.stringify({ disabled: ['dropped'] }));
// REQ-WORKSPACE-051's fourth user-scope root, redirected into the scratch tree: listed off Windows, absent on it.
write(join(scratch.machine, 'skills', 'machine-skill', 'SKILL.md'), skill('machine-skill', 'A skill from the machine-wide root.'));
// A skill outside every search root, for the hand-loaded case.
write(join(scratch.base, 'by-hand', 'SKILL.md'), skill('by-hand', 'Loaded by hand for this session.'));
const agentsYaml = join(workspace, '.rotaris', 'agents.yaml');

// ── 1. discover ─────────────────────────────────────────────────────────────────────────────────────
const discover = await launch('discover', workspace, openSkills());
const discovered = rows(discover.probes, '[data-testid="skill-row"]').map((r) => r.data['data-name']);
const expected = ['auto-only', 'home-skill', 'kept', ...(hasMachineRoot ? ['machine-skill'] : []), 'repo-wide', 'stop', 'ws-skill'];
if (JSON.stringify(discovered) !== JSON.stringify(expected)) fail(`the table listed ${JSON.stringify(discovered)}, not ${JSON.stringify(expected)} in ascending name order`);
results.push({ launch: 'discover', skills: discovered });

const byName = Object.fromEntries(rows(discover.probes, '[data-testid="skill-row"]').map((r) => [r.data['data-name'], r]));
// REQ-WORKSPACE-051: the scopes, and every project location outranking every user one.
if (byName['ws-skill'].data['data-scope'] !== 'project') fail('the workspace skill did not read as project scope');
if (byName['home-skill'].data['data-scope'] !== 'user') fail('the home skill did not read as user scope');
// The machine-wide root is user scope too (its path is checked against the scratch directory in launch 1c, whose entries carry it whole).
if (hasMachineRoot && byName['machine-skill'].data['data-scope'] !== 'user') fail('the machine-wide skill did not read as user scope');
// REQ-WORKSPACE-052: the manifest's entry never appears, and is not listed as skipped either.
if (discovered.includes('dropped')) fail('the disabled skill was listed');
// REQ-WORKSPACE-053: the invalid file is skipped WITH its reason rather than silently absent.
const skipped = rows(discover.probes, '[data-testid="skill-skipped"]');
if (skipped.length !== 1 || !skipped[0].data['data-path'].includes('broken')) fail(`the skipped list was ${JSON.stringify(skipped.map((s) => s.data['data-path']))}`);
if (!discover.log.includes('skills: skipped')) fail('the run host logged no skip reason');
// REQ-WORKSPACE-054: the shadowed duplicate is recorded against the winner and reportable per name.
if (!discover.log.includes(`${expected.length} discovered`)) fail(`the discovery log did not report ${expected.length} skills`);
// REQ-WORKSPACE-056: `user-invocable: false` derives auto-only from the frontmatter alone.
if (byName['auto-only'].data['data-invocation'] !== 'auto-only') fail('the frontmatter-derived invocation mode was not auto-only');
// REQ-WORKSPACE-065: the default policy with nothing recorded is on-demand.
if (byName['ws-skill'].data['data-load'] !== 'name-only') fail('the zero-migration default was not on-demand');

// ── 1b. commands ────────────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-034 / REQ-SHELL-056: the commands, with the collision suffixed and the auto-only skill absent.
// A SEPARATE launch, on the Workspace view: the registrar mounts with the transcript toolbar, and Settings
// replaces Workspace among REQ-SHELL-023's seven views, so a launch sitting in Settings has no composer at all.
// A prompt is submitted first: the registrar mounts with the transcript toolbar, which the Workspace view
// draws once there is a transcript to put it above (measured — with no session the probe found no element).
const commandsLaunch = await launch('commands', workspace, { ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.', ROTARIS_CAPTURE_AFTER_MS: '9000' }, 180_000);
const registered = (rows(commandsLaunch.probes, '[data-testid="skill-commands"]')[0]?.data['data-names'] ?? '').split(',').filter((s) => s !== '');
for (const name of ['ws-skill', 'render', 'pdf', 'home-skill', 'stop-2']) {
  if (!registered.includes(name)) fail(`/${name} was not registered; the catalogue holds ${JSON.stringify(registered)}`);
}
if (registered.includes('auto-only')) fail('an auto-only skill was offered as a command');
if (registered.includes('stop')) fail('a skill took the built-in /stop');
results.push({ launch: 'commands', commands: registered });

// ── 1c. /skills — REQ-CHAT-162's listing, one saved system row ─────────────────────────────────────────────
// A session first, because the row is written into ITS transcript and saved with it (OQ-67 (b): a window following
// no session is refused). Then `/skills` typed into the composer; the launch ends when the row is DRAWN, not at an
// appointment, and the command is listed in the same popup the generated skill commands are.
const listingWait = `js:document.querySelector('[data-testid="row-system"] [data-testid="skill-listing"]') !== null`;
const listingLaunch = await launch('listing', workspace, {
  ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.',
  ROTARIS_CAPTURE_TYPE: '/skills>>composer@9000',
  ROTARIS_CAPTURE_WAIT: listingWait,
  ROTARIS_CAPTURE_WAIT_MS: '45000',
  ROTARIS_CAPTURE_AFTER_MS: '900',
}, 180_000);
const listed = rows(listingLaunch.probes, '[data-testid="row-system"] [data-testid="skill-listing"]');
if (listed.length !== 1) fail(`/skills drew ${listed.length} listing rows, not one system row: ${JSON.stringify(listed)}`);
// REQ-CHAT-162: "MUST report how many skills were listed" — the same six the Settings table listed, in its order.
if (listed[0].data['data-count'] !== String(expected.length)) fail(`the listing reported ${listed[0].data['data-count']} skills, not ${expected.length}`);
if (listed[0].data['data-names'] !== expected.join(',')) fail(`the listing named ${listed[0].data['data-names']}, not ${expected.join(',')}`);
if (!listed[0].text.startsWith(`${expected.length} skills listed`)) fail(`the row's text did not open with its count: ${listed[0].text.slice(0, 80)}`);
const entries = Object.fromEntries(rows(listingLaunch.probes, '[data-testid="skill-listing-entry"]').map((r) => [r.data['data-name'], r.data]));
const wsEntry = entries['ws-skill'];
if (!wsEntry) fail(`the listing drew no entry for ws-skill: ${JSON.stringify(Object.keys(entries))}`);
// REQ-WORKSPACE-051's machine-wide root, read from the scratch directory the seam names and never from `/etc/codex/skills`.
if (hasMachineRoot && entries['machine-skill']?.['data-path'] !== join(scratch.machine, 'skills', 'machine-skill', 'SKILL.md')) fail(`the machine-wide skill was not read from the scratch root: ${JSON.stringify(entries['machine-skill'])}`);
// The five facts per skill: normalized name (the key above), scope, trigger keywords, description, SKILL.md path.
if (wsEntry['data-scope'] !== 'project' || entries['home-skill']?.['data-scope'] !== 'user') fail(`the scopes read ${wsEntry['data-scope']} / ${entries['home-skill']?.['data-scope']}`);
if (wsEntry['data-triggers'] !== 'render, /pdf') fail(`ws-skill's triggers read ${JSON.stringify(wsEntry['data-triggers'])}`);
if (wsEntry['data-description'] !== 'The workspace skill.') fail(`ws-skill's description read ${JSON.stringify(wsEntry['data-description'])}`);
if (wsEntry['data-path'] !== join(workspace, '.agents', 'skills', 'ws-skill', 'SKILL.md')) fail(`ws-skill's path read ${wsEntry['data-path']}`);
// REQ-CHAT-076: the URL in home-skill's description is the one link form, its trailing full stop outside the target,
// and it is the only link the listing draws.
const listingLinks = rows(listingLaunch.probes, '[data-testid="skill-listing-entry"] .md__link');
if (listingLinks.length !== 1 || listingLinks[0].data['data-href'] !== 'https://skills-proof.invalid/home-skill') fail(`the listing drew links ${JSON.stringify(listingLinks.map((l) => l.data['data-href']))}, not home-skill's one`);
if (entries['home-skill']?.['data-description'] !== 'A skill from the user scope, see https://skills-proof.invalid/home-skill.') fail(`home-skill's description read ${JSON.stringify(entries['home-skill']?.['data-description'])}`);
// ESC-37, ruled, and the amended REQ-CHAT-162: no per-skill in-context indicator on the listing.
if (Object.values(entries).some((e) => 'data-forced' in e || 'data-in-context' in e) || /in[ _-]?context/i.test(listed[0].text)) fail('the listing carries an in-context indicator');
// The run host wrote it through the session's writer, and says which session and which row.
const listedLine = /skills: listed (\d+) skill\(s\) into session (\S+) as transcript row (\d+)/.exec(listingLaunch.log);
if (!listedLine) fail('the run host logged no listing row');
if (listedLine[1] !== String(expected.length)) fail(`the run host listed ${listedLine[1]} skills`);
const listingSession = listedLine[2];
results.push({ launch: 'listing', session: listingSession, row: Number(listedLine[3]), count: listed[0].data['data-count'], names: listed[0].data['data-names'], wsSkill: wsEntry, link: listingLinks[0].data['data-href'] });

// ── 1d. the session reopened: the row is read back, not written again ─────────────────────────────────────
// A new launch reopens THAT session from the session browser (REQ-SHELL-126, REQ-SESSION-118); nothing is typed.
const listingReopen = await launch('listing-reopen', workspace, {
  ROTARIS_CAPTURE_RESUME: listingSession,
  ROTARIS_CAPTURE_WAIT: listingWait,
  ROTARIS_CAPTURE_WAIT_MS: '30000',
  ROTARIS_CAPTURE_AFTER_MS: '900',
}, 120_000);
const reread = rows(listingReopen.probes, '[data-testid="row-system"] [data-testid="skill-listing"]');
if (reread.length !== 1) fail(`the reopened session drew ${reread.length} listing rows: ${JSON.stringify(reread)}`);
if (reread[0].data['data-count'] !== listed[0].data['data-count'] || reread[0].data['data-names'] !== listed[0].data['data-names']) fail(`the reopened row differs: ${JSON.stringify(reread[0].data)} vs ${JSON.stringify(listed[0].data)}`);
if (!listingReopen.log.includes(`capture: opened session "${listingSession}" from the browser`)) fail(`the launch did not reopen session ${listingSession}`);
if (/skills: listed \d+ skill/.test(listingReopen.log)) fail('the reopened launch listed the skills again instead of reading the saved row');
results.push({ launch: 'listing-reopen', session: listingSession, count: reread[0].data['data-count'] });

// ── 2. policy ───────────────────────────────────────────────────────────────────────────────────────
/*
 * A GLOBAL policy for one skill, so REQ-CONFIG-258's "write the baseline out explicitly" case is reachable at
 * all. The path is `resolveUserDirs().config` by the platform that reads it (`configDirFor`): on Windows
 * `%LOCALAPPDATA%/rotaris/rotaris`, off Windows `<XDG_CONFIG_HOME>/rotaris` — the proof points both at the scratch
 * tree, so this is that tree's own global scope and not the operator's. Spelled for Windows alone, the run host
 * never read it off Windows and this launch failed at the explicit baseline
 * (`docs/defects/fixed/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md`).
 */
const globalAgents = join(configDirFor(scratch.local), 'agents.yaml');
write(globalAgents, 'skills:\n  overrides:\n    home-skill: on\n');
const policy = await launch('policy', workspace, openSkills({
  // The Load selector for `ws-skill` to always, its Invocation to manual only, and `home-skill` back to the
  // on-demand baseline — which a lower layer states, so it must be written out rather than deleted.
  ROTARIS_CAPTURE_SELECT: '[aria-label="Load policy for ws-skill"]>>on@1500;;[aria-label="Invocation policy for ws-skill"]>>manual-only@1900;;[aria-label="Load policy for home-skill"]>>name-only@2300',
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary@3000',
  ROTARIS_CAPTURE_AFTER_MS: '4200',
}));
// Finding 2 of ADR-0063's first execution: before the repair the selectors were bound to the run host's
// projection, so a choice was recorded as "chosen" and every row still read its file value.
const chosen = Object.fromEntries(rows(policy.probes, '[data-testid="skill-row"]').map((r) => [r.data['data-name'], r.data['data-load']]));
if (chosen['ws-skill'] !== 'on') fail(`the Load selector did not hold the chosen value: ${JSON.stringify(chosen)}`);
if (!existsSync(agentsYaml)) fail('Save wrote no workspace agents.yaml');
const written = readFileSync(agentsYaml, 'utf8');
results.push({ launch: 'policy', agentsYaml: written });
if (!/ws-skill:\s*on/.test(written)) fail(`the always policy was not written: ${written}`);
if (!/ws-skill:\s*manual-only/.test(written)) fail(`the invocation override was not written: ${written}`);
// REQ-CONFIG-258: the baseline is written out explicitly BECAUSE the global scope states a policy for it.
if (!/home-skill:\s*name-only/.test(written)) fail(`the baseline over a global override was not written explicitly: ${written}`);
// …and no skill the user did not touch is in the file at all.
if (/repo-wide|auto-only|kept\s*:/.test(written)) fail(`the save was not sparse: ${written}`);

// ── 3. reopen ───────────────────────────────────────────────────────────────────────────────────────
const reopen = await launch('reopen', workspace, openSkills());
const reopened = Object.fromEntries(rows(reopen.probes, '[data-testid="skill-row"]').map((r) => [r.data['data-name'], r.data]));
if (reopened['ws-skill']['data-load'] !== 'on') fail(`after reopening, the Load selector read ${reopened['ws-skill']['data-load']}`);
if (reopened['ws-skill']['data-invocation'] !== 'manual-only') fail('after reopening, the Invocation selector did not hold');
const status = rows(reopen.probes, '.save-bar__status')[0]?.text ?? '';
if (/unsaved/i.test(status)) fail(`the form was dirty on open: ${status}`);
results.push({ launch: 'reopen', wsSkill: reopened['ws-skill'], status });

// ── 4. run ──────────────────────────────────────────────────────────────────────────────────────────
// A scripted run: the units are composed at agent construction, so the log carries them.
const run = await launch('run', workspace, {
  ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.',
  ROTARIS_CAPTURE_AFTER_MS: '9000',
}, 180_000);
results.push({ launch: 'run', log: run.log.split('\n').filter((l) => l.includes('skills:')).slice(0, 12) });
// REQ-WORKSPACE-058: session creation re-discovered from disk.
if (!/skills: \d+ discovered/.test(run.log)) fail('the run logged no discovery');
// REQ-WORKSPACE-060/062: the units composed at agent construction, named in the log. `ws-skill` is `on` after
// launch 2, so its body is force-loaded and its catalog entry is gone; every other skill is in the catalog.
const unitLine = run.log.split(/\r?\n/).find((l) => l.includes('skills: context units'));
if (!unitLine) fail('the run host logged no context units, so nothing proves injection happened');
if (!/force-loaded [^;]*ws-skill/.test(unitLine)) fail(`the always-load skill was not force-loaded: ${unitLine}`);
if (/catalog [^;]*ws-skill/.test(unitLine)) fail(`a force-loaded skill was still listed in the catalog: ${unitLine}`);
for (const name of ['home-skill', 'repo-wide', 'kept', 'auto-only', ...(hasMachineRoot ? ['machine-skill'] : [])]) {
  if (!unitLine.includes(name)) fail(`${name} was not in the injected catalog: ${unitLine}`);
}
results.push({ launch: 'run', units: unitLine.slice(unitLine.indexOf('skills:')) });

// ── 5. rescan, the chooser's dismissal, and a bad path ───────────────────────────────────────────────
write(join(workspace, '.agents', 'skills', 'added-later', 'SKILL.md'), skill('added-later', 'Added while the session was open.'));
const rescan = await launch('rescan', workspace, openSkills({
  ROTARIS_CAPTURE_CLICKS: '[data-testid="skills-rescan"]@1600;;[data-testid="skills-load-file"]@3000;;[data-testid="skills-load-file"]@4400',
  // Two answers, consumed in order: a dismissal, then a real selection.
  ROTARIS_CAPTURE_SKILL_FILE: `(cancel);;${join(scratch.base, 'by-hand')}`,
  ROTARIS_CAPTURE_AFTER_MS: '5800',
}));
const afterRescan = rows(rescan.probes, '[data-testid="skill-row"]').map((r) => r.data['data-name']);
if (!afterRescan.includes('added-later')) fail(`the rescan did not pick up the new skill: ${JSON.stringify(afterRescan)}`);
// REQ-WORKSPACE-151 / REQ-WORKSPACE-057: the hand-loaded skill carries the `manual` label.
const hand = rows(rescan.probes, '[data-testid="skill-row"]').find((r) => r.data['data-name'] === 'by-hand');
if (!hand) fail(`the hand-loaded skill was not listed: ${JSON.stringify(afterRescan)}`);
if (hand.data['data-scope'] !== 'manual') fail(`the hand-loaded skill read as ${hand.data['data-scope']}, not manual`);
// REQ-WORKSPACE-069 / REQ-WORKSPACE-151: neither action marks the form dirty.
const rescanStatus = rows(rescan.probes, '.save-bar__status')[0]?.text ?? '';
if (/unsaved/i.test(rescanStatus)) fail(`a rescan or a hand-load marked the form dirty: ${rescanStatus}`);
results.push({ launch: 'rescan', skills: afterRescan, status: rescanStatus });

// ── 6. disabled ─────────────────────────────────────────────────────────────────────────────────────
write(agentsYaml, `${readFileSync(agentsYaml, 'utf8').replace(/^skills:$/m, 'skills:\n  enabled: false')}\n`);
if (!readFileSync(agentsYaml, 'utf8').includes('enabled: false')) write(agentsYaml, `${readFileSync(agentsYaml, 'utf8')}\nskills:\n  enabled: false\n`);
// On the Workspace view, for the same reason launch 1b is: the command registrar mounts with the composer.
const disabled = await launch('disabled', workspace, { ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.', ROTARIS_CAPTURE_AFTER_MS: '9000' }, 180_000);
// REQ-WORKSPACE-064: no catalog is injected and nothing is invocable.
const disabledCommands = (rows(disabled.probes, '[data-testid="skill-commands"]')[0]?.data['data-names'] ?? '').split(',').filter((s) => s !== '');
if (disabledCommands.length > 0) fail(`with skills off the catalogue still offered ${JSON.stringify(disabledCommands)}`);
// And once more in Settings, so the switch itself is read off the file.
const disabledTab = await launch('disabled-tab', workspace, openSkills());
const toggle = rows(disabledTab.probes, '[data-testid="skills-enabled"]')[0];
if (!toggle) fail('the Skills tab drew no switch');
if (toggle.data['aria-checked'] === 'true') fail('the switch read on while the file said off');
results.push({ launch: 'disabled', commands: disabledCommands, toggle: toggle.data['aria-checked'] });

writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`skills-proof: ${results.length} checks over 9 launches, evidence in ${output}`);
console.log(`  discovered ${expected.length} skills; commands ${JSON.stringify(registered)}`);
console.log(`  policy written sparsely to ${agentsYaml}`);
console.log(`  rescan found ${afterRescan.length}; with skills off the catalogue offers none`);
console.log(`  /skills wrote one saved system row listing ${listed[0].data['data-count']} skills into ${listingSession}; reopened, it was still there`);
if (!existsSync(join(repo, '.proof'))) fail('the evidence directory vanished');
