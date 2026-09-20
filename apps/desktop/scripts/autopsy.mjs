#!/usr/bin/env node
/**
 * R-043 — the run-autopsy snapshot printer: the store_snapshot.py habit as a
 * product reader. Read-only: it opens the workspace store read-only, runs one
 * pass over the session's own records, and prints the session row, the
 * per-model-key tool-call attribution (from the children record — the
 * usage.update payload carries tokens and cost alone), failure
 * detail grouped by cause, the usage curve with the largest jumps, coherence
 * warnings, and per-endpoint model-request counts.
 *
 * Covered work (nothing minted): REQ-SESSION-139's metrics document rebuilt
 * from state plus evidence records, REQ-SESSION-199's four records read in
 * one consistent state, REQ-SESSION-153's trajectory summary recomputed from
 * the exported events alone, REQ-SESSION-136's tool-call record fields, and
 * REQ-SESSION-134/135's timeline and issue shapes. Locators are carried,
 * never resolved (REQ-EVENTS-056). The snapshot writes nothing to the
 * session's own record: every read is a SELECT, and the only wall-clock read
 * is the ring headers' `taken_at`.
 *
 * Usage:
 *   node apps/desktop/scripts/autopsy.mjs [workspace.db] [session-id]
 *
 * With no arguments it takes the newest `workspace.db` below the platform's
 * per-user data directory and the session with the latest `updated_at` whose
 * `run_started_at` is not null. Every printed line is truncated to 220
 * columns, so one model-catalogue dump cannot take the transcript.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(join(process.cwd(), 'apps', 'desktop', 'package.json'));
const Database = require('better-sqlite3');

const CUT = 220;
const cut = (s) => (s.length > CUT ? `${s.slice(0, CUT)}…` : s);
const ms = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US');
const parseJson = (text) => {
  try {
    const v = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
  } catch { return undefined; }
};
const str = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const head = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

function findDatabases(root, out = []) {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) findDatabases(path, out);
    else if (entry.name === 'workspace.db') out.push(path);
  }
  return out;
}

function newestDatabase() {
  const roots = [];
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'rotaris', 'data', 'workspaces'));
  roots.push(join(homedir(), '.local', 'share', 'rotaris', 'workspaces'));
  roots.push(tmpdir());
  let best = null;
  for (const root of roots) {
    for (const db of findDatabases(root)) {
      const mtime = statSync(db).mtimeMs;
      if (!best || mtime > best.mtime) best = { path: db, mtime };
    }
  }
  if (!best) throw new Error('no workspace.db found; pass one explicitly');
  return best.path;
}

function failureDetail(tool, entry) {
  const args = entry?.args;
  const argv = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : undefined;
  if (tool === 'terminal') return head(str(argv?.command).replace(/\s+/g, ' '), 160);
  const path = argv?.path ?? argv?.pattern;
  if (typeof path === 'string' && path !== '') return head(path, 160);
  return head(str(entry?.result), 220);
}

const dbPath = process.argv[2] ?? newestDatabase();
const db = new Database(dbPath, { readonly: true, fileMustExist: true });

const sessions = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
let sid = process.argv[3] ?? null;
if (!sid) {
  const started = sessions.filter((s) => s.run_started_at !== null);
  if (started.length === 0) throw new Error(`no started session in ${dbPath}`);
  sid = started[0].session_id;
}
const row = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sid);
if (!row) throw new Error(`no session ${sid} in ${dbPath}`);

const toolCalls = db.prepare('SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(sid);
const timeline = db.prepare('SELECT ordinal, at, name, actor, message, severity FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid);
const issues = db.prepare('SELECT ordinal, id, kind, severity, actor, message FROM issues WHERE session_id = ? ORDER BY ordinal').all(sid);
const events = db.prepare('SELECT ordinal, kind, at, payload FROM events WHERE session_id = ? ORDER BY ordinal').all(sid);
const children = db.prepare('SELECT given_name, persona, state, tool_calls, model_key FROM children WHERE session_id = ? ORDER BY spawned_at').all(sid);
const checkpoints = db.prepare('SELECT sequence FROM checkpoints WHERE session_id = ? ORDER BY sequence').all(sid);
db.close();

// Per-tool totals with elapsed sums; failed vs blocked partitioned by status.
const byTool = new Map();
for (const t of toolCalls) {
  const key = `${t.tool_name} [${t.status}]`;
  const prev = byTool.get(key) ?? { tool: t.tool_name, status: t.status, calls: 0, errors: 0, elapsed: 0 };
  prev.calls += 1;
  if (t.is_error === 1) prev.errors += 1;
  prev.elapsed += t.elapsed_ms ?? 0;
  byTool.set(key, prev);
}
const tools = [...byTool.values()].sort((a, b) => b.elapsed - a.elapsed);

// Failures grouped by cause: the record's failure_kind where it carries one, else the status.
const groups = new Map();
for (const t of toolCalls) {
  if (t.is_error !== 1 && t.status === 'ok') continue;
  const entry = parseJson(t.entry);
  const cause = str(entry?.failure_kind) || t.status;
  const list = groups.get(cause) ?? [];
  list.push({ ordinal: t.ordinal, tool: t.tool_name, agent: t.agent_name, detail: failureDetail(t.tool_name, entry) });
  groups.set(cause, list);
}

// Usage curve with the largest jumps, from the stored usage.update payloads.
const jumps = [];
let prev = 0;
for (const e of events) {
  if (e.kind !== 'usage.update') continue;
  const tokens = parseJson(e.payload)?.tokens;
  const input = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens) ? num(tokens.input) : 0;
  const output = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens) ? num(tokens.output) : 0;
  const jump = input - prev;
  prev = input;
  if (jump > 0) jumps.push({ at: e.at, input, output, jump });
}
jumps.sort((a, b) => b.jump - a.jump);

// Coherence: duplicate reads, retried commands, summary and cost flags.
const reads = new Map();
for (const t of toolCalls) {
  if (t.tool_name !== 'read_file' || t.status !== 'ok') continue;
  const args = parseJson(t.entry)?.args;
  const path = args !== null && typeof args === 'object' && !Array.isArray(args) ? str(args.path) : '';
  if (path !== '') reads.set(path, (reads.get(path) ?? 0) + 1);
}
const commands = new Map();
for (const t of toolCalls) {
  if (t.tool_name !== 'terminal') continue;
  const args = parseJson(t.entry)?.args;
  const command = args !== null && typeof args === 'object' && !Array.isArray(args) ? head(str(args.command).replace(/\s+/g, ' '), 120) : '';
  if (command !== '') commands.set(command, (commands.get(command) ?? 0) + 1);
}
const stopped = !['idle', 'running', 'background', 'waiting'].includes(row.execution_status);

// Per-model-key attribution: the store records no provider or model on the
// usage.update payload (tokens and cost alone), so tool calls attribute to
// the model_key the children record carries. The entry agent's own calls
// read as the session's own model key.
const callsByAgent = new Map();
for (const t of toolCalls) callsByAgent.set(t.agent_name, (callsByAgent.get(t.agent_name) ?? 0) + 1);
const keyByAgent = new Map(children.map((c) => [c.given_name, c.model_key]));
const childAgents = new Set(keyByAgent.keys());
const entryKey = new Set(children.map((c) => c.model_key)).size === 1 ? children[0].model_key : 'session';
const endpoints = new Map();
for (const [agent, n] of callsByAgent) {
  const key = childAgents.has(agent) ? keyByAgent.get(agent) : entryKey;
  const prev = endpoints.get(key) ?? { agents: [], calls: 0 };
  prev.agents.push(agent);
  prev.calls += n;
  endpoints.set(key, prev);
}

console.log(`## Run autopsy — ${row.session_id} (${row.execution_status}${row.stop_reason ? `, ${row.stop_reason}` : ''}, ${row.tokens_input} in / ${row.tokens_output} out)`);
console.log(`store: ${dbPath}`);
console.log(`iterations: ${row.iterations_completed}, tool calls: ${row.tool_calls}, compressions: ${row.compressions}, cost: ${row.cost}`);
console.log(`summary [${row.summary_status ?? 'none'}]: ${cut(row.summary_text ?? '')}`);
console.log('');
console.log('### tools (elapsed sums, failed vs blocked partitioned)');
for (const t of tools) console.log(cut(`  ${t.tool} [${t.status}]: ${t.calls} calls, ${t.errors} errors, ${ms(t.elapsed)} ms`));
console.log('');
console.log('### failures by cause');
if (groups.size === 0) console.log('  none');
for (const [cause, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(cut(`  ${cause} ×${list.length} [${[...new Set(list.map((f) => f.tool))].join(', ')}] ordinals ${list.map((f) => f.ordinal).join(', ')}`));
  console.log(cut(`    e.g. ${list[0].detail} (agent ${list[0].agent})`));
}
console.log('');
console.log('### usage jumps (largest first)');
if (jumps.length === 0) console.log('  none');
for (const j of jumps.slice(0, 10)) console.log(`  ${j.at}: in=${j.input} out=${j.output} jump=+${j.jump}`);
console.log('');
console.log('### coherence');
console.log(`  null summary on stopped run: ${stopped && (row.summary_text ?? '') === ''}`);
console.log(`  zero cost with tokens: ${row.cost === '0' && row.tokens_input + row.tokens_output > 0}`);
for (const [path, n] of [...reads.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(cut(`  read ${n}×: ${path}`));
for (const [command, n] of [...commands.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(cut(`  retried ${n}×: ${command}`));
console.log('');
console.log('### tool calls per model key (from the children record)');
if (endpoints.size === 0) console.log('  none recorded');
for (const [endpoint, v] of [...endpoints.entries()].sort((a, b) => b[1].calls - a[1].calls)) console.log(cut(`  ${endpoint}: ${v.calls} calls [${v.agents.sort().join(', ')}]`));
console.log('');
console.log(`counts: timeline=${timeline.length} issues=${issues.length} children=${children.length} checkpoints=${checkpoints.length}`);
for (const c of children) console.log(cut(`  child ${c.given_name} [${c.persona}]: ${c.state}, ${c.tool_calls} tool calls`));
