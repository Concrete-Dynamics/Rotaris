#!/usr/bin/env node
/**
 * A tiny hand-written MCP server speaking newline-delimited JSON-RPC over stdio, for the two spikes of
 * ADR-0033 (protocol negotiation over `OwnedStdioTransport`; console-window suppression) and for the MCP
 * proof (`pnpm mcp-proof`). No SDK: the wire behaviour is written out so what each era does is visible.
 *
 *   --era 2025|2026        which protocol era the fixture speaks (default 2025).
 *                          2025: answers `initialize` (offering back the client's version when it is one of the
 *                          2025 eras, else its own), returns -32601 to `server/discover` and every unknown method.
 *                          2026: answers `server/discover` with `supportedVersions: ['2026-07-28']`, ALSO answers
 *                          a legacy `initialize` (a real 2026 server keeps the old handshake), and expects `_meta`.
 *   --era 2026-only        a 2026 server that rejects `initialize` (-32601): speaks the new negotiation only.
 *   --era 2025-strict      a 2025 server that EXITS on any request before `initialize` (the shape the SDK's sibling
 *                          probe exists for): what `'auto'` does to it over our in-place transport is measured.
 *   --pid-file <path>      append this process's pid and a line per launch (the proof counts processes).
 *   --request-file <path>  append the method of every request received, one per line (a test counts probes).
 *   --client-file <path>   append the `clientInfo` of every `initialize` as one JSON line (who the client said it was,
 *                          REQ-STARTUP-158: the product version, never a literal).
 *   --rename-after <ms>    after the first tools/list, wait then publish `notifications/tools/list_changed`
 *                          with `extra` withdrawn and `newcomer` introduced (REQ-MCP-060's narrowing).
 *   --crash-after <ms>     exit(3) that many ms after the first tools/call is received (REQ-MCP-069).
 *   --never-init           never answer `initialize` or `server/discover` (REQ-MCP-053's bound).
 *   --init-delay <ms>      answer `initialize` after a delay.
 *   --stderr <text>        write that text to stderr at start (ADR-0007: it must reach the log redacted).
 *   --no-list-changed      do not advertise tools.listChanged.
 *
 * Tools: `echo {text}` → the text; `slow {ms}` → answers after ms; `fail` → isError result; `extra` → 'extra';
 * `lsp_init {root}` → 'initialised <root>' (REQ-MCP-070's hook, when the fixture is configured under the name lsp).
 */
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i === -1 ? dflt : (args[i + 1] ?? dflt); };
const has = (name) => args.includes(name);
const era = opt('--era', '2025');
const pidFile = opt('--pid-file');
const requestFile = opt('--request-file');
const clientFile = opt('--client-file');
const renameAfter = Number(opt('--rename-after', '0'));
const crashAfter = Number(opt('--crash-after', '0'));
const initDelay = Number(opt('--init-delay', '0'));
const neverInit = has('--never-init');
const stderrText = opt('--stderr');
const stderrRepeat = opt('--stderr-repeat');
const stderrCount = Number(opt('--stderr-count', '0'));
const listChanged = !has('--no-list-changed');
if (pidFile) appendFileSync(pidFile, `${process.pid}\n`);
if (stderrText) process.stderr.write(`${stderrText}\n`);
// The run of 2026-09-18: a server whose validation block repeats per connection attempt.
if (stderrRepeat) for (let i = 0; i < (stderrCount || 3); i += 1) process.stderr.write(`${stderrRepeat}\n`);

const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];
const MODERN = '2026-07-28';
let renamed = false;
let listed = false;
let calls = 0;

const tools = () => {
  const base = [
    { name: 'echo', description: 'Echo the text back.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'slow', description: 'Answer after a delay.', inputSchema: { type: 'object', properties: { ms: { type: 'number' } } } },
    { name: 'fail', description: '', inputSchema: { type: 'object', properties: {} } },
    { name: 'lsp_init', description: 'Initialise against a root.', inputSchema: { type: 'object', properties: { root: { type: 'string' } } } },
  ];
  if (!renamed) base.push({ name: 'extra', description: 'Present until the list changes.', inputSchema: { type: 'object', properties: {} } });
  else base.push({ name: 'newcomer', description: 'Introduced by the update; never callable (REQ-MCP-060).', inputSchema: { type: 'object', properties: {} } });
  return base;
};

const write = (msg) => { process.stdout.write(`${JSON.stringify(msg)}\n`); };
// The 2026-07-28 revision requires `resultType` on every result; a 2025 client ignores the extra key.
const reply = (id, result) => write({ jsonrpc: '2.0', id, result: era.startsWith('2025') ? result : { resultType: 'complete', ...result } });
const fail = (id, code, message) => write({ jsonrpc: '2.0', id, error: { code, message } });
const notify = (method, params) => write({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });

function callTool(id, params) {
  const name = params?.name;
  const a = params?.arguments ?? {};
  calls += 1;
  if (crashAfter > 0 && calls === 1) setTimeout(() => process.exit(3), crashAfter);
  if (name === 'echo') return reply(id, { content: [{ type: 'text', text: String(a.text ?? '') }] });
  if (name === 'slow') { setTimeout(() => reply(id, { content: [{ type: 'text', text: `slept ${a.ms ?? 0}` }] }), Number(a.ms ?? 0)); return; }
  if (name === 'fail') return reply(id, { content: [{ type: 'text', text: 'the fixture failed on purpose' }], isError: true });
  if (name === 'extra' && !renamed) return reply(id, { content: [{ type: 'text', text: 'extra' }] });
  if (name === 'newcomer' && renamed) return reply(id, { content: [{ type: 'text', text: 'newcomer' }] });
  if (name === 'lsp_init') return reply(id, { content: [{ type: 'text', text: `initialised ${a.root ?? ''}` }] });
  return fail(id, -32602, `unknown tool ${name}`);
}

function handle(msg) {
  const { id, method, params } = msg;
  if (method === undefined) return; // a response to something we sent; nothing is sent that expects one
  if (requestFile) appendFileSync(requestFile, `${method}\n`);
  if (method === 'initialize') {
    if (clientFile) appendFileSync(clientFile, `${JSON.stringify(params?.clientInfo ?? null)}\n`);
    if (neverInit) return;
    if (era === '2026-only') return fail(id, -32601, 'Method not found');
    const offered = params?.protocolVersion;
    const version = LEGACY_VERSIONS.includes(offered) ? offered : LEGACY_VERSIONS[0];
    const answer = () => reply(id, { protocolVersion: version, capabilities: { tools: listChanged ? { listChanged: true } : {} }, serverInfo: { name: `fixture-${era}`, version: '0.0.0' } });
    if (initDelay > 0) setTimeout(answer, initDelay); else answer();
    return;
  }
  if (method === 'server/discover') {
    if (neverInit) return;
    if (era === '2025-strict') { process.stderr.write('unexpected request before initialize'); process.exit(2); }
    if (era === '2025') return fail(id, -32601, 'Method not found');
    return reply(id, { supportedVersions: [MODERN], capabilities: { tools: listChanged ? { listChanged: true } : {} }, serverInfo: { name: `fixture-${era}`, version: '0.0.0' } });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') {
    // The 2026 revision's cacheable list carries a cache hint (ttlMs, cacheScope); the 2025 shape has neither.
    reply(id, era.startsWith('2025') ? { tools: tools() } : { tools: tools(), ttlMs: 0, cacheScope: 'public' });
    if (!listed && renameAfter > 0) {
      listed = true;
      setTimeout(() => { renamed = true; notify('notifications/tools/list_changed'); }, renameAfter);
    }
    return;
  }
  if (method === 'tools/call') return callTool(id, params);
  if (method === 'subscriptions/listen') return reply(id, { _meta: { subscriptionId: 'fixture-1' } });
  if (id !== undefined) return fail(id, -32601, 'Method not found');
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const nl = buffer.indexOf('\n');
    if (nl === -1) break;
    const line = buffer.slice(0, nl).replace(/\r$/, '');
    buffer = buffer.slice(nl + 1);
    if (line.trim() === '') continue;
    let msg;
    try { msg = JSON.parse(line); } catch { fail(null, -32700, 'Parse error'); continue; }
    try { handle(msg); } catch (e) { if (msg.id !== undefined) fail(msg.id, -32603, String(e)); }
  }
});
process.stdin.on('end', () => process.exit(0));
