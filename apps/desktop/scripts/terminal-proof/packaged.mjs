/**
 * Part T2 — `runtime.terminal_stream_enabled: false` in the PACKAGED application, which every earlier execution of
 * ADR-0021 left owed (Part AL measured it headless, Part AL′ through Electron but not through a packaged build).
 *
 * REQ-TOOLS-126 states the cost of the key exactly — "the live view, never the command" — and REQ-TOOLS-127 states
 * that streaming changes nothing the agent sees, "with or without a consumer, and whether or not publishing
 * succeeds". So the measurement is a DIFFERENCE between two launches of the same executable that differ in one line
 * of workspace configuration, and it is only evidence if both halves are read: the surface must lose its live view
 * and the agent must not lose a byte.
 *
 * Both launches drive the product's own path, and only what a packaged build keeps (ADR-0056: it carries no verification
 * seam; `scripts/lib/seam-check.mjs` names what it compiles out). The packaged `Rotaris.exe` runs on a scratch profile and a
 * scratch workspace whose configuration names an OpenAI-compatible model at a loopback stub this section starts for the
 * launch (`scripts/lib/stub-model-endpoint.mjs`, the one `pnpm package`'s rule 4 (b) runs against since OQ-312), which
 * answers the run's tools request with one `terminal` call (`git status`) through the real gate into the real
 * pseudo-terminal. The launch is given the packaged probe's three variables (`KEPT`: the photograph, the prompt, when to
 * photograph) and nothing else of the product's own. Both launches are read the same way:
 *
 *   - the SURFACE, through REQ-SHELL-109's own behaviour: the scratch profile's preference `interface/terminalPopout` is on, so
 *     the first `meta` frame of a running stream of the followed session opens the terminal window, and main logs
 *     "terminal window auto-opening for <stream> (REQ-SHELL-109)". With the key on that line names the run's stream (the live
 *     view reached main and its window); with it off no frame is published and no such line is written;
 *   - the STORE the launch wrote, for the session and the `terminal` tool call — its status, its error flag and the
 *     observation text inside its entry, which REQ-TOOLS-127 requires to be identical either way;
 *   - the STUB's counts, which say the terminal call came from the shipped model client's request.
 *
 * Until 2026-10-15 the launches drove the scripted model (`ROTARIS_MODEL_DIALECT=scripted`, `ROTARIS_SCRIPT=git`) and read the
 * renderer through `ROTARIS_CAPTURE_EVAL_AT` (the Workspace toolbar's `data-total`, REQ-SHELL-108, and the live preview blocks),
 * all of which a packaged build compiles out since fin43 to fin46, so the section measured nothing on any package `pnpm package`
 * could produce (docs/defects/fixed/terminal-proofs-packaged-launch-drives-seams-a-packaged-build-compiles-out.md). The
 * toolbar's total and the preview blocks are read in the development build by `terminal-stream-proof`'s Electron half; a
 * packaged build's renderer has no reading but its photograph, which is kept.
 *
 * The store is found by hashing nothing and guessing nothing: each launch is given its OWN `LOCALAPPDATA`, so its
 * workspace store is the only one under it (the sixty-eighth defect was a proof that read another workspace's store).
 *
 * It needs `apps/desktop/release/win-unpacked/Rotaris.exe`, which
 * `ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package` builds (with `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`
 * while `pnpm notices` refuses; first-release-plan.md §4.4). Absent, this REFUSES and says so; it never passes quietly
 * and never falls back to the development build, which would not be the packaged application. `--app=<out/main/index.js>`
 * (standalone) or `app` (the export) names a SEAM-FREE `ROTARIS_BUILD=package` build to launch under Electron instead, for a
 * host without the Windows package (IC-3); it is refused unless the seam check finds that build seam-free, and the result
 * names it as `target`.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { hostSwitches, proofIsolationEnv, workspacesRootFor } from '../lib/harness.mjs';
import { overrunMessage, spawnBounded } from '../lib/bounded-launch.mjs';
import { KEPT, seamCheck } from '../lib/seam-check.mjs';
import { startStubModelEndpoint } from '../lib/stub-model-endpoint.mjs';

const require = createRequire(import.meta.url);

/** The observation text inside a recorded tool-call entry, wherever the entry keeps it (ADR-0020's markers). */
function observationOf(entry) {
  const found = [];
  const walk = (v) => {
    if (typeof v === 'string') { const m = /\[(?:partial_)?terminal_output\]\n([\s\S]*?)\n\[terminal_diagnostic\]/.exec(v); if (m) found.push(m[1]); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v && typeof v === 'object') { for (const x of Object.values(v)) walk(x); }
  };
  try { walk(JSON.parse(entry)); } catch { walk(entry); }
  return found.length > 0 ? found.join('\n---\n') : null;
}

/** REQ-SHELL-109's line in main's log: a running stream of the followed session opened the terminal window. */
const AUTO_OPEN = /terminal window auto-opening for (\S+) \(REQ-SHELL-109\)/;

/** The streams a launch's log says opened the terminal window by themselves (REQ-SHELL-109), in log order. */
export function autoOpenedStreams(log) {
  const out = [];
  for (const line of String(log).split(/\r?\n/)) { const m = AUTO_OPEN.exec(line); if (m) out.push(m[1]); }
  return out;
}

/**
 * The environment a launch is given: the operator's, with every `ROTARIS_` variable removed, the scratch profile's isolation
 * (its preference root included, REQ-UIBENCH's override, which ships), and the packaged probe's three alone (`KEPT`).
 */
export function launchEnvironment({ base = process.env, scratch, localAppData, preferences, png, afterMs }) {
  const env = { ...base };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  // Both variable pairs, so the launch's store is the launch's own on every platform and not the operator's.
  Object.assign(env, proofIsolationEnv({ profileRoot: scratch, local: localAppData, preferences }));
  const probe = { ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROMPT: 'show me the tree', ROTARIS_CAPTURE_AFTER_MS: String(afterMs) };
  for (const key of Object.keys(probe)) if (!KEPT.includes(key)) throw new Error(`${key} is not one of the packaged probe's variables (${KEPT.join(', ')})`);
  return Object.assign(env, probe);
}

/** One launch of the packaged executable with the key set one way, read from main's log, its own store and its stub. */
async function launch({ exe, args = [], scratchRoot, name, enabled, afterMs }) {
  const scratch = join(scratchRoot, name);
  rmSync(scratch, { recursive: true, force: true });
  const ws = join(scratch, 'workspace');
  const localAppData = join(scratch, 'LocalAppData');
  const preferences = join(scratch, 'preferences');
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  mkdirSync(preferences, { recursive: true });
  writeFileSync(join(ws, 'README.md'), '# scratch\n');
  // REQ-SHELL-109's preference (REQ-CONFIG-405), set as a person sets it: the window opens on a running stream's first frame.
  writeFileSync(join(preferences, 'preferences.json'), `${JSON.stringify({ 'interface/terminalPopout': true }, null, 2)}\n`);
  const stub = await startStubModelEndpoint();
  try {
    // The two workspaces differ in ONE line. Everything else — the stub model, the autonomous mode, the single strategy — is
    // what `pnpm package`'s own rule 4 (b) launch uses, so the difference measured is the key's.
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), [
      'models:',
      `  stub: { provider: openai, model_id: terminal-stream-stub, base_url: "${stub.baseUrl}", api_key: terminal-stream-placeholder-key }`,
      'small_model: stub',
      'medium_model: stub',
      'large_model: stub',
      'runtime:',
      '  permission_mode: autonomous',
      `  terminal_stream_enabled: ${enabled ? 'true' : 'false'}`,
      'rotaris:',
      '  delegation_strategy: single',
      '',
    ].join('\n'));
    spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' });

    const png = join(scratch, 'painted.png');
    const env = launchEnvironment({ scratch, localAppData, preferences, png, afterMs });
    const r = await spawnBounded(exe, [...args, ...hostSwitches, ws], { env, timeoutMs: 180_000, windowsHide: true });
    const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    writeFileSync(join(scratch, 'app.log'), log);
    const surface = { autoOpened: autoOpenedStreams(log) };
    const model = { ...stub.counts };

    const stores = [];
    // By the platform (see `workspacesRootFor`): the POSIX answer carries no `data` segment.
    const workspaces = workspacesRootFor(localAppData);
    if (existsSync(workspaces)) for (const d of readdirSync(workspaces)) { const f = join(workspaces, d, 'workspace.db'); if (existsSync(f)) stores.push(f); }
    const out = { enabled, exit: r.status ?? null, signal: r.signal ?? null, painted: existsSync(png), stores: stores.length, log: join(scratch, 'app.log'), model };
    // An overrun is this launch's failure, reported with its last words; the other launch's evidence is kept.
    if (r.overran) return { ...out, error: overrunMessage(name, r, log), surface: null, terminal: null };
    // The same two fields every other return carries, so the checks below read an absent store as absent evidence
    // (`docs/defects/fixed/the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md`).
    if (stores.length !== 1) return { ...out, error: `expected one workspace store under this launch's own LOCALAPPDATA, found ${stores.length}`, surface: null, terminal: null };
    // A read that throws is reported, never thrown: one bad query must not lose the other launch's evidence.
    let sessions = [];
    let calls = [];
    let readError = null;
    try {
      const Database = require('better-sqlite3');
      const db = new Database(stores[0], { readonly: true });
      sessions = db.prepare('SELECT session_id, execution_status, created_at FROM sessions ORDER BY updated_at DESC').all();
      calls = db.prepare('SELECT tool_name, status, is_error, entry FROM tool_calls ORDER BY ordinal').all();
      db.close();
    } catch (cause) { readError = String(cause && cause.message ? cause.message : cause); }
    const terminal = calls.find((c) => c.tool_name === 'terminal') ?? null;
    return {
      ...out,
      ...(readError === null ? {} : { readError }),
      surface,
      sessions: sessions.map((s) => ({ id: s.session_id, status: s.execution_status, createdAt: s.created_at })),
      calls: calls.map((c) => ({ tool: c.tool_name, status: c.status, isError: c.is_error })),
      terminal: terminal ? { status: terminal.status, isError: terminal.is_error, observation: observationOf(terminal.entry) } : null,
    };
  } finally {
    await stub.close();
  }
}

/**
 * The assertion set over the two launches, each a boolean with a name that says what it claims. A launch that stopped
 * short — an overrun, no store, a read that threw — may carry `terminal` and `surface` as `null` or not at all; either
 * is ABSENT evidence and reads false, never throws: a check that throws loses the other launch's evidence with it.
 */
export function packagedChecks(on, off) {
  const onTerminal = on?.terminal ?? null;
  const offTerminal = off?.terminal ?? null;
  const onSurface = on?.surface ?? null;
  const offSurface = off?.surface ?? null;
  const servedTheCall = (l) => (l?.model?.toolsRequests ?? 0) >= 1 && (l?.model?.terminalCalls ?? 0) >= 1;
  return {
    // Both launches got as far as a painted window and a settled terminal call, or nothing below means anything.
    bothPainted: on?.painted === true && off?.painted === true,
    bothRanTheTerminalCall: onTerminal !== null && offTerminal !== null && onTerminal.status !== 'running' && offTerminal.status !== 'running',
    // OQ-312: each terminal call came from the shipped model client's request to the stub, not from a stand-in in the build.
    bothCallsFromTheShippedClient: servedTheCall(on) && servedTheCall(off),
    // REQ-TOOLS-126/127: the command is untouched — same settled status, same error flag, same observation text.
    agentSeesTheSameThing: onTerminal !== null && offTerminal !== null
      && onTerminal.status === offTerminal.status && onTerminal.isError === offTerminal.isError
      && onTerminal.observation != null && onTerminal.observation === offTerminal.observation,
    // REQ-TOOLS-126: with the key on, the live view exists — the stream's frame reached main and opened its window (REQ-SHELL-109).
    enabledSurfaceSawTheStream: onSurface !== null && Array.isArray(onSurface.autoOpened) && onSurface.autoOpened.length >= 1,
    // …and with it off, nothing was published: the same run's terminal call opened no window.
    disabledSurfaceSawNothing: offSurface !== null && offTerminal !== null && Array.isArray(offSurface.autoOpened) && offSurface.autoOpened.length === 0,
  };
}

/**
 * @param {{ repo: string, afterMs?: number, app?: string }} options `app` names a seam-free `out/main/index.js` to launch under
 *   Electron in place of the Windows package (see the header); it is refused unless the seam check passes on its directory.
 * @returns a promise of `{ available, refusal?, target, enabled, disabled, checks }` — `checks` is `packagedChecks`' assertion
 * set, which the proof folds into its own results.
 */
export async function packagedTerminalStreaming({ repo, afterMs = 16_000, app }) {
  const release = join(repo, 'apps', 'desktop', 'release');
  let exe = join(release, 'win-unpacked', 'Rotaris.exe');
  let args = [];
  let target = 'package';
  if (app !== undefined) {
    const seams = seamCheck(dirname(app));
    if (seams.present.length > 0 || seams.missing.length > 0) {
      return { available: false, refusal: `${app} is not a seam-free build (present: ${seams.present.join(', ') || 'none'}; probe names missing: ${seams.missing.join(', ') || 'none'}); build it with \`ROTARIS_BUILD=package pnpm exec electron-vite build\`. This section reports NOTHING rather than measuring a build that carries the verification seams.` };
    }
    exe = join(repo, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
    args = [app];
    target = `seam-free build ${app}`;
  } else if (!existsSync(exe)) {
    return {
      available: false,
      refusal: `no packaged executable at ${exe} — build it with \`ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package\` (and \`ROTARIS_PACKAGE_WITHOUT_NOTICES=1\` while \`pnpm notices\` refuses). This section reports NOTHING rather than measuring the development build, which is not the packaged application.`,
    };
  }
  const scratchRoot = join(release, 'terminal-stream-proof');
  const on = await launch({ exe, args, scratchRoot, name: 'streaming-on', enabled: true, afterMs });
  const off = await launch({ exe, args, scratchRoot, name: 'streaming-off', enabled: false, afterMs });
  return { available: true, target, exe, afterMs, enabled: on, disabled: off, checks: packagedChecks(on, off) };
}

// Standalone: `node apps/desktop/scripts/terminal-proof/packaged.mjs [--app=<seam-free out/main/index.js>]`, for a reader who
// wants only this section.
if (process.argv[1] && process.argv[1].endsWith('packaged.mjs')) {
  // Four segments, not three: this file sits at `apps/desktop/scripts/terminal-proof/`, so three `..` land on
  // `<repo>/apps` and the refusal above then names a path that cannot exist (`<repo>/apps/apps/desktop/…`).
  const repo = join(import.meta.dirname, '..', '..', '..', '..');
  const app = process.argv.find((a) => a.startsWith('--app='))?.slice(6);
  const r = await packagedTerminalStreaming({ repo, ...(app ? { app } : {}) });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.available && Object.values(r.checks).every(Boolean) ? 0 : 1);
}
