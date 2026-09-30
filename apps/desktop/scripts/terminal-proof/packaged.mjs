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
 * Both launches drive the product's own path — the packaged `Rotaris.exe` on a scratch profile and a scratch
 * workspace, the scripted model dialect taking one `terminal` step (`git status`) through the real gate into the real
 * pseudo-terminal — and both are read the same way:
 *
 *   - the RENDERER, through `ROTARIS_CAPTURE_EVAL_AT`, which is the product's own verification seam (Part Z) and
 *     evaluates one expression in the window and logs its JSON: the Workspace toolbar's terminal control, whose
 *     `data-total` is REQ-SHELL-108's session total ("the total count only ever climbs within a session") and so
 *     survives the command's end, and the number of live preview blocks on screen;
 *   - the STORE the launch wrote, for the session and the `terminal` tool call — its status, its error flag and the
 *     observation text inside its entry, which REQ-TOOLS-127 requires to be identical either way.
 *
 * The store is found by hashing nothing and guessing nothing: each launch is given its OWN `LOCALAPPDATA`, so its
 * workspace store is the only one under it (the sixty-eighth defect was a proof that read another workspace's store).
 *
 * It needs `apps/desktop/release/win-unpacked/Rotaris.exe`, which
 * `ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package` builds (with `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`
 * while `pnpm notices` refuses; first-release-plan.md §4.4). Absent, this REFUSES and says so; it never passes quietly
 * and never falls back to the development build, which would not be the packaged application.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { hostSwitches, proofIsolationEnv, workspacesRootFor } from '../lib/harness.mjs';
import { overrunMessage, spawnBounded } from '../lib/bounded-launch.mjs';

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

/** One launch of the packaged executable with the key set one way, read from the renderer and from its own store. */
async function launch({ exe, scratchRoot, name, enabled, afterMs }) {
  const scratch = join(scratchRoot, name);
  rmSync(scratch, { recursive: true, force: true });
  const ws = join(scratch, 'workspace');
  const localAppData = join(scratch, 'LocalAppData');
  mkdirSync(join(ws, '.rotaris'), { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  writeFileSync(join(ws, 'README.md'), '# scratch\n');
  // The two workspaces differ in ONE line. Everything else — the scripted models, the autonomous mode, the single
  // strategy — is what `pnpm package`'s own rule 4 (b) launch uses, so the difference measured is the key's.
  writeFileSync(join(ws, '.rotaris', 'agents.yaml'), [
    'models:',
    '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted',
    'medium_model: scripted',
    'large_model: scripted',
    'runtime:',
    '  permission_mode: autonomous',
    `  terminal_stream_enabled: ${enabled ? 'true' : 'false'}`,
    'rotaris:',
    '  delegation_strategy: single',
    '',
  ].join('\n'));
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' });

  // REQ-SHELL-108's control carries the session TOTAL, which only climbs, so it still reports the stream after the
  // command has ended; the preview blocks are REQ-SHELL-079's live view. Both are the product's own surfaces.
  const probe = "(() => { const b = document.querySelector('[data-testid=\"transcript-terminal\"]'); return { toolbar: b ? { label: (b.textContent || '').trim(), name: b.getAttribute('aria-label'), description: b.getAttribute('aria-description'), running: Number(b.getAttribute('data-running')), total: Number(b.getAttribute('data-total')) } : null, previews: document.querySelectorAll('[data-testid=\"term-preview\"]').length, streamed: document.querySelectorAll('[data-stream-id]').length }; })()";
  const png = join(scratch, 'painted.png');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  // Both variable pairs, so the launch's store is the launch's own on every platform and not the
  // operator's. `APPDATA` now lands in the scratch profile too, where it used to be inherited; this proof
  // reads the store below `LOCALAPPDATA` and names no preference root, so nothing here reads either.
  Object.assign(env, proofIsolationEnv({ profileRoot: scratch, local: localAppData }));
  env.ROTARIS_MODEL_DIALECT = 'scripted';
  env.ROTARIS_SCRIPT = 'git';
  env.ROTARIS_CAPTURE_PNG = png;
  env.ROTARIS_CAPTURE_PROMPT = 'show me the tree';
  env.ROTARIS_CAPTURE_AFTER_MS = String(afterMs);
  env.ROTARIS_CAPTURE_EVAL_AT = `${probe}@${afterMs - 2000}`;

  const r = await spawnBounded(exe, [...hostSwitches, ws], { env, timeoutMs: 180_000, windowsHide: true });
  const log = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  writeFileSync(join(scratch, 'app.log'), log);

  let probeValue = null;
  for (const line of log.split(/\r?\n/)) {
    if (!line.includes('capture: eval-at ')) continue;
    const arrow = line.lastIndexOf(' → ');
    if (arrow === -1) continue;
    try { probeValue = JSON.parse(line.slice(arrow + 3)); } catch { /* a later line may parse */ }
  }

  const stores = [];
  // By the platform (see `workspacesRootFor`): the POSIX answer carries no `data` segment.
  const workspaces = workspacesRootFor(localAppData);
  if (existsSync(workspaces)) for (const d of readdirSync(workspaces)) { const f = join(workspaces, d, 'workspace.db'); if (existsSync(f)) stores.push(f); }
  const out = { enabled, exit: r.status ?? null, signal: r.signal ?? null, painted: existsSync(png), stores: stores.length, log: join(scratch, 'app.log') };
  // An overrun is this launch's failure, reported with its last words; the other launch's evidence is kept.
  if (r.overran) return { ...out, error: overrunMessage(name, r, log), probe: null, terminal: null };
  // The same two fields every other return carries, so the checks below read an absent store as absent evidence
  // (`docs/defects/fixed/the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md`).
  if (stores.length !== 1) return { ...out, error: `expected one workspace store under this launch's own LOCALAPPDATA, found ${stores.length}`, probe: probeValue, terminal: null };
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
    probe: probeValue,
    sessions: sessions.map((s) => ({ id: s.session_id, status: s.execution_status, createdAt: s.created_at })),
    calls: calls.map((c) => ({ tool: c.tool_name, status: c.status, isError: c.is_error })),
    terminal: terminal ? { status: terminal.status, isError: terminal.is_error, observation: observationOf(terminal.entry) } : null,
  };
}

/**
 * The assertion set over the two launches, each a boolean with a name that says what it claims. A launch that stopped
 * short — an overrun, no store, a read that threw — may carry `terminal` and `probe` as `null` or not at all; either
 * is ABSENT evidence and reads false, never throws: a check that throws loses the other launch's evidence with it.
 */
export function packagedChecks(on, off) {
  const onTerminal = on?.terminal ?? null;
  const offTerminal = off?.terminal ?? null;
  const onToolbar = on?.probe?.toolbar ?? null;
  const offProbe = off?.probe ?? null;
  const offToolbar = offProbe?.toolbar ?? null;
  return {
    // Both launches got as far as a painted window and a settled terminal call, or nothing below means anything.
    bothPainted: on?.painted === true && off?.painted === true,
    bothRanTheTerminalCall: onTerminal !== null && offTerminal !== null && onTerminal.status !== 'running' && offTerminal.status !== 'running',
    // REQ-TOOLS-126/127: the command is untouched — same settled status, same error flag, same observation text.
    agentSeesTheSameThing: onTerminal !== null && offTerminal !== null
      && onTerminal.status === offTerminal.status && onTerminal.isError === offTerminal.isError
      && onTerminal.observation != null && onTerminal.observation === offTerminal.observation,
    // REQ-TOOLS-126: with the key on, the live view exists — the toolbar's session total counted the stream.
    enabledSurfaceSawTheStream: onToolbar !== null && onToolbar.total >= 1,
    // …and with it off, nothing was published: no stream was ever counted and no preview block was ever drawn.
    disabledSurfaceSawNothing: offToolbar !== null && offToolbar.total === 0 && offProbe.previews === 0,
  };
}

/**
 * @returns a promise of `{ available, refusal?, enabled, disabled, checks }` — `checks` is `packagedChecks`' assertion
 * set, which the proof folds into its own results.
 */
export async function packagedTerminalStreaming({ repo, afterMs = 16_000 }) {
  const release = join(repo, 'apps', 'desktop', 'release');
  const exe = join(release, 'win-unpacked', 'Rotaris.exe');
  if (!existsSync(exe)) {
    return {
      available: false,
      refusal: `no packaged executable at ${exe} — build it with \`ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package\` (and \`ROTARIS_PACKAGE_WITHOUT_NOTICES=1\` while \`pnpm notices\` refuses). This section reports NOTHING rather than measuring the development build, which is not the packaged application.`,
    };
  }
  const scratchRoot = join(release, 'terminal-stream-proof');
  const on = await launch({ exe, scratchRoot, name: 'streaming-on', enabled: true, afterMs });
  const off = await launch({ exe, scratchRoot, name: 'streaming-off', enabled: false, afterMs });
  return { available: true, exe, afterMs, enabled: on, disabled: off, checks: packagedChecks(on, off) };
}

// Standalone: `node apps/desktop/scripts/terminal-proof/packaged.mjs`, for a reader who wants only this section.
if (process.argv[1] && process.argv[1].endsWith('packaged.mjs')) {
  // Four segments, not three: this file sits at `apps/desktop/scripts/terminal-proof/`, so three `..` land on
  // `<repo>/apps` and the refusal above then names a path that cannot exist (`<repo>/apps/apps/desktop/…`).
  const repo = join(import.meta.dirname, '..', '..', '..', '..');
  const r = await packagedTerminalStreaming({ repo });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.available && Object.values(r.checks).every(Boolean) ? 0 : 1);
}
