/**
 * The tool-shapes proof: two single shapes of a tool call that the live run could not be sure to ask, driven through the
 * BUILT application with the scripted client (free: no provider, no key, no network). Each is the built-app half of a gap
 * the 2026-10-13 survey found (item N60); the live run's own half is in `live-run.mjs` and is the orchestrator's to run.
 *
 *   1. hard-cap          — REQ-TOOLS-097's default-path hard cap (`hardMs`): a `terminal` call that names NO `timeout` and
 *                          keeps printing, in a workspace whose saved `runtime.shell_command_timeout` (REQ-CONFIG-116) is
 *                          4 s. The call must be ended by that cap — a hard timeout naming 4 s, the session reset, what it
 *                          printed kept — and never by REQ-TOOLS-098's soft pause, which a command that prints every 0.5 s
 *                          never meets. The live run's silent wedge soft-paused 70 s before the default 100 s cap on every
 *                          run, so the cap had been reached only in a unit test
 *                          (`docs/defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`).
 *   2. inferred-create   — PD-TOOLS-007: a `write_file` call with a path and content and no `operation`, for a file that does
 *                          not exist, is read as a create: the file lands, the result carries the directive's sentence, and
 *                          the record stores the arguments the gate read (`operation: create`).
 *   3. inferred-existing — the same call again, now that the file exists: refused, saying the file exists, its content
 *                          untouched (PD-TOOLS-007: only a create is inferred), and the refusal, an `invalid_request` at the
 *                          tool gate, files a `tool_error` issue referencing it (REQ-SESSION-136). No proof had sent the shape: the scripted
 *                          `write` step always named its operation
 *                          (`docs/defects/fixed/the-live-runs-frictions-prompt-never-asks-pd-tools-007s-inferred-create.md`).
 *
 * Each launch asserts from the store's `tool_calls`, `issues` and the workspace on disk, never from the model's prose. Evidence
 * under `.proof/tool-shapes-proof/`: one log per launch and `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { cleanEnvironment, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { hardCapReading } from './lib/terminal-shapes.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'tool-shapes-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
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

/** The hard cap the hard-cap launch saves, in seconds (REQ-CONFIG-116's minimum is 1). */
const CAP_S = 4;
/** One `tick-<n>` line every 500 ms for 15 s: never quiet for the 30 s no-output window, and well past the cap. */
const STEADY = `node -e "let n = 0; const t = setInterval(() => { n += 1; console.log('tick-' + n); if (n === 30) clearInterval(t); }, 500)"`;
const INFERRED = 'INFERRED.md';

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(local, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Tool shapes proof workspace\n');

function saveConfiguration(runtime) {
  const lines = ['# scratch configuration written by the tool-shapes proof', 'models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', 'mcp_servers:', '  code_intelligence: { enabled: false }', 'runtime:'];
  for (const [key, value] of Object.entries(runtime)) lines.push(`  ${key}: ${String(value)}`);
  lines.push('');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), lines.join('\n'));
}

/** One launch: the scripted coordinator, granted the direct-work bundle (REQ-ORCH-016), takes `script` and answers. */
async function launch(name, script, runtime, extra = {}) {
  saveConfiguration(runtime);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    timeoutMs: 150_000, cwd: app,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ROTARIS_INTENT_SCRIPT: 'explicit_trivial',
      ROTARIS_SCRIPT: script,
      ROTARIS_CAPTURE_PROMPT: `Tool shape: ${name}`, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
      ROTARIS_CAPTURE_PNG: join(output, `${name}.png`),
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(overrunMessage(name, result, log));
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (/capture: wait for result timed out/.test(log)) throw new Error(`${name}: the run did not reach its result inside the capture's wait`);
  const db = new Database(oneDatabase(local), { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    const rows = db.prepare('SELECT ordinal, tool_name, status, is_error, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(session.session_id).map((row) => {
      const entry = JSON.parse(row.entry);
      return { ordinal: row.ordinal, tool_name: row.tool_name, status: row.status, isError: row.is_error === 1, args: entry.args ?? {}, result: String(entry.result ?? ''), failureKind: entry.failure_kind ?? null, callId: entry.call_id ?? null, elapsedMs: typeof entry.elapsed_ms === 'number' ? entry.elapsed_ms : null };
    });
    const issues = db.prepare('SELECT kind, message, evidence_ref FROM issues WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
    if (session.execution_status !== 'completed') throw new Error(`${name}: the run ended ${session.execution_status} (${session.stop_reason})`);
    return { name, session: session.session_id, rows, issues, log };
  } finally { db.close(); }
}

const only = (r, tool) => {
  const calls = r.rows.filter((row) => row.tool_name === tool);
  if (calls.length !== 1) throw new Error(`${r.name}: expected one ${tool} row; found ${calls.length} (${r.rows.map((row) => `${row.ordinal} ${row.tool_name} ${row.status}`).join(', ') || 'none'})`);
  return calls[0];
};

const results = {};
// 1. The default-path hard cap, read from the saved configuration (REQ-TOOLS-097, REQ-CONFIG-116).
const capped = await launch('hard-cap', 'terminal:steady,answer', { permission_mode: 'autonomous', shell_command_timeout: CAP_S }, {
  ROTARIS_SCRIPT_TERMINAL_ARGS: JSON.stringify({ steady: { command: STEADY } }),
});
const steady = only(capped, 'terminal');
if (steady.args.timeout !== undefined) throw new Error(`hard-cap: the call carried a timeout of its own (${steady.args.timeout}), so hardMs was never read`);
const cap = hardCapReading(steady, { capSeconds: CAP_S });
const said = `${cap.kind}: timeout_seconds ${cap.timeoutSeconds ?? 'none'}, exit ${cap.exit ?? 'none'}, kill_status ${cap.killStatus ?? 'none'}, ${cap.ticks} tick line(s), ${cap.elapsedMs ?? '?'} ms`;
if (cap.kind !== 'capped') throw new Error(`hard-cap: the call was not ended by the saved ${CAP_S} s cap (${said}):\n${steady.result}`);
if (cap.exit !== 124) throw new Error(`hard-cap: the timed-out call's exit code is ${cap.exit}, not 124 (${said})`);
if (cap.killStatus !== 'session_reset') throw new Error(`hard-cap: the cap did not reset the session to end the process tree (${said})`);
if (cap.elapsedMs === null || cap.elapsedMs < CAP_S * 1000 || cap.elapsedMs >= 15_000) throw new Error(`hard-cap: the call took ${cap.elapsedMs} ms; the cap is ${CAP_S * 1000} ms and the command runs 15,000 ms (${said})`);
if (cap.ticks < 3) throw new Error(`hard-cap: only ${cap.ticks} tick line(s) of what the command printed came back with the timeout (${said})`);
if (steady.failureKind !== 'timeout' || !steady.isError) throw new Error(`hard-cap: failure_kind ${steady.failureKind}, is_error ${steady.isError}`);
if (!steady.result.includes('[partial_terminal_output]')) throw new Error('hard-cap: the observation carries no [partial_terminal_output] section');
// REQ-SESSION-136: a timed-out call files `terminal_timeout` referencing it.
const timedOut = capped.issues.filter((i) => i.kind === 'terminal_timeout' && i.evidence_ref === `tool_call_evidence#${steady.callId}`);
if (timedOut.length !== 1) throw new Error(`hard-cap: no terminal_timeout issue references the call (REQ-SESSION-136): ${JSON.stringify(capped.issues)}`);
results.hardCap = { capSeconds: CAP_S, timeoutSeconds: cap.timeoutSeconds, exit: cap.exit, killStatus: cap.killStatus, elapsedMs: cap.elapsedMs, ticks: cap.ticks, issue: timedOut[0].message };

// 2. PD-TOOLS-007: no operation, the file absent — read as a create.
const created = await launch('inferred-create', 'writeinfer,answer', { permission_mode: 'autonomous' });
const create = only(created, 'write_file');
if (create.status !== 'ok' || create.isError) throw new Error(`inferred-create: the write settled ${create.status}:\n${create.result}`);
if (!/No operation was given, so this call was read as 'create'/.test(create.result)) throw new Error(`inferred-create: the result does not carry PD-TOOLS-007's sentence:\n${create.result}`);
if (create.args.operation !== 'create') throw new Error(`inferred-create: the record stores operation ${JSON.stringify(create.args.operation)}, not the create the gate read`);
const landed = existsSync(join(workspace, INFERRED)) ? readFileSync(join(workspace, INFERRED), 'utf8') : null;
if (landed !== 'inferred-ok\n') throw new Error(`inferred-create: ${INFERRED} holds ${JSON.stringify(landed)}`);
results.inferredCreate = { status: create.status, recordedOperation: create.args.operation, sentence: true, content: landed };

// 3. The same call with the file present — refused, saying so, the content untouched.
writeFileSync(join(workspace, INFERRED), 'kept\n');
const again = await launch('inferred-existing', 'writeinfer,answer', { permission_mode: 'autonomous' });
const refused = only(again, 'write_file');
if (refused.status === 'ok' || !refused.isError) throw new Error(`inferred-existing: a write with no operation over an existing file settled ${refused.status}:\n${refused.result}`);
// PD-TOOLS-007's own sentence, not any mention of "exists".
const EXISTS_SENTENCE = `${INFERRED} already exists, so the call was not read as a create; name 'overwrite' or 'edit'.`;
if (!refused.result.includes(EXISTS_SENTENCE)) throw new Error(`inferred-existing: the refusal does not carry PD-TOOLS-007's sentence "${EXISTS_SENTENCE}":\n${refused.result}`);
// REQ-TOOLS-032: a call that does not match its schema is refused as invalid_request — and REQ-SESSION-136 (live-run finding
// a71-6): a call the tool gate refused as invalid_request files a tool_error issue referencing it.
if (refused.failureKind !== 'invalid_request') throw new Error(`inferred-existing: the refusal's failure kind is ${JSON.stringify(refused.failureKind)}, not invalid_request`);
const filed = again.issues.filter((i) => i.kind === 'tool_error' && i.evidence_ref === `tool_call_evidence#${refused.callId}`);
if (filed.length !== 1) throw new Error(`inferred-existing: the invalid_request refusal filed no tool_error issue referencing it (REQ-SESSION-136): ${JSON.stringify(again.issues)}`);
const kept = readFileSync(join(workspace, INFERRED), 'utf8');
if (kept !== 'kept\n') throw new Error(`inferred-existing: ${INFERRED} was changed to ${JSON.stringify(kept)}`);
results.inferredExisting = { status: refused.status, failureKind: refused.failureKind, toolErrorIssues: filed.length, result: refused.result.split('\n')[0].slice(0, 200), content: kept };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('tool-shapes-proof: PASS');
