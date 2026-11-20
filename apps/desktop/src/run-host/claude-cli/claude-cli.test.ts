import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage, ModelRequest, StreamPart, ToolSpec } from '@rotaris/model';
import { ClaudeCliModelClient, credentialConflict, failureOf, openingContent, renderHistory, WAITING_SESSION_IDLE_MS, type CliLaunch, type CliProcess } from './client.js';
import { LoopbackToolBridge, type BridgeSessionHandlers, type ToolBridge } from './tool-bridge.js';

/** A process that says what the test tells it to, and records what it was started with and told. */
class FakeProcess implements CliProcess {
  readonly written: string[] = [];
  killed = false;
  inputEnded = false;
  private line: (l: string) => void = () => undefined;
  private exit: (code: number | null, stderr: string) => void = () => undefined;
  write(l: string): void { this.written.push(l); }
  endInput(): void { this.inputEnded = true; }
  kill(): void { this.killed = true; }
  onLine(fn: (l: string) => void): void { this.line = fn; }
  onExit(fn: (code: number | null, stderr: string) => void): void { this.exit = fn; }
  say(...messages: unknown[]): void { for (const m of messages) this.line(JSON.stringify(m)); }
  end(code: number | null, stderr = ''): void { this.exit(code, stderr); }
}

const se = (event: unknown): unknown => ({ type: 'stream_event', event });
const textTurn = (text: string): unknown[] => [
  se({ type: 'message_start', message: { usage: { input_tokens: 2, cache_read_input_tokens: 100 } } }),
  se({ type: 'content_block_delta', delta: { type: 'text_delta', text } }),
  se({ type: 'message_delta', usage: { input_tokens: 2, cache_read_input_tokens: 100, output_tokens: 7 } }),
  se({ type: 'message_stop' }),
  { type: 'result', subtype: 'success', is_error: false, result: text, stop_reason: 'end_turn' },
];
const toolTurn = (id: string, name: string): unknown[] => [
  se({ type: 'message_start', message: { usage: { input_tokens: 5 } } }),
  se({ type: 'content_block_start', content_block: { type: 'tool_use', id, name: `mcp__rotaris__${name}` } }),
  se({ type: 'message_delta', usage: { input_tokens: 5, output_tokens: 20 } }),
  se({ type: 'message_stop' }),
];

function world(over: { env?: Record<string, string | undefined>; settings?: string | null } = {}) {
  const clock = new FakeClock();
  const launches: (CliLaunch & { process: FakeProcess })[] = [];
  const sessions: BridgeSessionHandlers[] = [];
  const released: number[] = [];
  const files = new Map<string, string>();
  const bridge: ToolBridge = {
    register: async (handlers) => { const i = sessions.push(handlers) - 1; return { config: { mcpServers: { rotaris: { type: 'http', url: `http://127.0.0.1:1/mcp/${i}`, headers: { Authorization: 'Bearer b' } } } }, release: () => { released.push(i); } }; },
    close: async () => undefined,
  };
  const client = new ClaudeCliModelClient({
    timers: clock, bridge, env: over.env ?? { PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'x' }, cwd: '/nowhere', readUserSettings: () => over.settings ?? null,
    launch: (l) => { const process = new FakeProcess(); launches.push({ ...l, process }); return process; },
    writeSessionFile: (kind, text) => { const path = `/files/${kind}-${files.size}`; files.set(path, text); return path; }, removeFile: (path) => { files.delete(path); },
    log: () => undefined, warn: () => undefined,
  });
  return { clock, client, launches, sessions, released, files };
}

const tools: ToolSpec[] = [{ name: 'read_file', description: 'Reads a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }];
const sys: ChatMessage = { role: 'system', content: [{ kind: 'text', text: 'You are the orchestrator.' }] };
const user = (text: string): ChatMessage => ({ role: 'user', content: [{ kind: 'text', text }] });
const request = (messages: ChatMessage[], over: Partial<ModelRequest> = {}): ModelRequest => ({
  model: { providerId: 'claude-code', modelId: 'haiku', dialect: 'chat' }, messages, thinking: 'unset', signal: new AbortController().signal, timeoutMs: 60_000, retries: 0, resolveCredential: async () => 'claude-code-local-tool', tools, ...over,
});

/** Reads a step to its end, feeding the process between parts through `feed` once the stream has been opened. */
async function step(stream: AsyncIterable<{ ok: true; value: StreamPart } | { ok: false; error: { code: string; status?: number; providerMessage?: string; headline: string } }>, feed: () => void | Promise<void>) {
  const parts: StreamPart[] = [];
  let error: { code: string; status?: number; providerMessage?: string; headline: string } | null = null;
  const it = stream[Symbol.asyncIterator]();
  const first = it.next();
  await new Promise((r) => setImmediate(r));
  await feed();
  for (let r = await first; !r.done; r = await it.next()) { if (r.value.ok) parts.push(r.value.value); else { error = r.value.error; break; } }
  // As a `for await` does when its body leaves early: the stream is told it is done with, and its cleanup runs.
  await it.return?.();
  return { parts, error };
}

describe('the Claude Code client (PD-PROVIDER-002)', () => {
  it('starts the installed tool as a model only: its tools off, its settings unread, the product\'s bridge its one tool server, no credential handed over', async () => {
    const w = world();
    const { parts, error } = await step(w.client.stream(request([sys, user('hi')])), () => w.launches[0]!.process.say(...textTurn('Hello')));
    expect(error).toBeNull();
    const l = w.launches[0]!;
    expect(l.executable).toBe('claude');
    expect(l.cwd).toBe('/nowhere');
    const flag = (name: string): string | undefined => l.args[l.args.indexOf(name) + 1];
    expect(l.args).toEqual(expect.arrayContaining(['-p', '--strict-mcp-config', '--no-session-persistence', '--include-partial-messages']));
    expect(flag('--tools')).toBe('');
    expect(flag('--setting-sources')).toBe('');
    expect(flag('--allowedTools')).toBe('mcp__rotaris');
    expect(flag('--model')).toBe('haiku');
    expect(flag('--input-format')).toBe('stream-json');
    expect(l.args).not.toContain('--effort');
    // The instructions and the tool description went by file, and the files are gone when the turn is over.
    expect(flag('--system-prompt-file')).toMatch(/^\/files\/instructions-/);
    expect(flag('--mcp-config')).toMatch(/^\/files\/tools-/);
    expect(w.files.size).toBe(0);
    // The process authenticates itself: nothing is added that is a credential, and the two nesting markers are withheld.
    expect(l.env['CLAUDECODE']).toBeUndefined();
    expect(l.env['CLAUDE_CODE_ENTRYPOINT']).toBeUndefined();
    expect(Object.keys(l.env).filter((k) => /TOKEN|KEY|SECRET/i.test(k))).toEqual([]);
    expect(JSON.stringify(l.args)).not.toContain('claude-code-local-tool');
    expect(JSON.parse(l.process.written[0]!)).toEqual({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } });
    expect(parts).toEqual([{ kind: 'text', delta: 'Hello' }, { kind: 'usage', usage: { input: 102, output: 7 } }, { kind: 'finish', reason: 'stop' }]);
    expect(l.process.killed).toBe(true);
    expect(w.released).toEqual([0]);
    expect(w.clock.pendingCount()).toBe(0);
  });

  it('hands a tool call to the run loop and answers it with the next step\'s result, on the same process', async () => {
    const w = world();
    const first = await step(w.client.stream(request([sys, user('read it')])), async () => {
      w.launches[0]!.process.say(...toolTurn('toolu_1', 'read_file'));
      // The tool's own request reaches the bridge after the message that asked for it.
      void w.sessions[0]!.call({ callId: 'toolu_1', name: 'read_file', args: { path: 'package.json' } }).then((r) => { answered.push(r); });
    });
    expect(first.error).toBeNull();
    expect(first.parts).toEqual([
      { kind: 'tool-input', callId: 'toolu_1' },
      { kind: 'tool-call', callId: 'toolu_1', name: 'read_file', argsDelta: '{"path":"package.json"}' },
      { kind: 'usage', usage: { input: 5, output: 20 } },
      { kind: 'finish', reason: 'stop' },
    ]);
    expect(w.sessions[0]!.tools().map((t) => t.name)).toEqual(['read_file']);
    // The process waits; nothing was answered and nothing killed.
    expect(w.launches[0]!.process.killed).toBe(false);
    expect(answered).toEqual([]);
    const history: ChatMessage[] = [sys, user('read it'), { role: 'assistant', content: [{ kind: 'tool-call', callId: 'toolu_1', name: 'read_file', args: '{"path":"package.json"}' }] }, { role: 'tool', content: [{ kind: 'tool-result', callId: 'toolu_1', name: 'read_file', result: '{"name":"x"}', isError: false }] }];
    const second = await step(w.client.stream(request(history)), () => w.launches[0]!.process.say(...textTurn('x')));
    expect(answered).toEqual([{ text: '{"name":"x"}', isError: false }]);
    expect(w.launches).toHaveLength(1);
    expect(second.parts.at(0)).toEqual({ kind: 'text', delta: 'x' });
    expect(second.parts.at(-1)).toEqual({ kind: 'finish', reason: 'stop' });
    expect(w.launches[0]!.process.killed).toBe(true);
  });
  const answered: { text: string; isError: boolean }[] = [];

  it('starts anew with the conversation as text when no process waits for the results a step carries, and gives up a waiting one at its idle bound', async () => {
    const w = world();
    await step(w.client.stream(request([sys, user('read it')])), async () => {
      w.launches[0]!.process.say(...toolTurn('toolu_9', 'read_file'));
      void w.sessions[0]!.call({ callId: 'toolu_9', name: 'read_file', args: {} }).then((r) => { gaveUp.push(r); });
    });
    w.clock.advance(WAITING_SESSION_IDLE_MS);
    await new Promise((r) => setImmediate(r));
    expect(w.launches[0]!.process.killed).toBe(true);
    expect(gaveUp).toEqual([{ text: expect.stringContaining('ended before'), isError: true }]);
    const history: ChatMessage[] = [sys, user('read it'), { role: 'assistant', content: [{ kind: 'text', text: 'Reading.' }, { kind: 'tool-call', callId: 'toolu_9', name: 'read_file', args: '{}' }] }, { role: 'tool', content: [{ kind: 'tool-result', callId: 'toolu_9', name: 'read_file', result: 'contents', isError: false }] }];
    const again = await step(w.client.stream(request(history)), () => w.launches[1]!.process.say(...textTurn('done')));
    expect(again.error).toBeNull();
    expect(w.launches).toHaveLength(2);
    const opening = (JSON.parse(w.launches[1]!.process.written[0]!) as { message: { content: { text: string }[] } }).message.content[0]!.text;
    expect(opening).toContain('<tool_result id="toolu_9" tool="read_file">\ncontents\n</tool_result>');
    expect(opening).toContain('Continue from where it stands');
  });
  const gaveUp: { text: string; isError: boolean }[] = [];

  it('REQ-PROVIDER-048: refuses before every prompt while another credential outranks the subscription, naming each source', async () => {
    expect(credentialConflict({}, null)).toBeNull();
    expect(credentialConflict({ ANTHROPIC_API_KEY: '' }, '{"model":"x"}')).toBeNull();
    const both = credentialConflict({ ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_USE_BEDROCK: '1' }, '{"apiKeyHelper":"/bin/helper"}')!;
    expect(both).toContain('ANTHROPIC_API_KEY');
    expect(both).toContain('CLAUDE_CODE_USE_BEDROCK');
    expect(both).toContain('apiKeyHelper');
    expect(both).not.toContain(' k');
    const w = world({ env: { ANTHROPIC_AUTH_TOKEN: 't' } });
    const { error } = await step(w.client.stream(request([sys, user('hi')])), () => undefined);
    expect(error).toMatchObject({ code: 'validation', providerMessage: expect.stringContaining('ANTHROPIC_AUTH_TOKEN') });
    expect(w.launches).toEqual([]);
  });

  it('ends the process on an abort, an idle bound and its own failure, and reads the failure for its class', async () => {
    const w = world();
    const abort = new AbortController();
    const aborted = await step(w.client.stream(request([sys, user('hi')], { signal: abort.signal })), () => abort.abort());
    expect(aborted.error).toMatchObject({ code: 'aborted' });
    expect(w.launches[0]!.process.killed).toBe(true);
    const idle = await step(w.client.stream(request([sys, user('hi')], { timeoutMs: 1_000 })), () => w.clock.advance(1_000));
    expect(idle.error).toMatchObject({ code: 'timeout' });
    const limit = await step(w.client.stream(request([sys, user('hi')])), () => w.launches[2]!.process.say({ type: 'result', subtype: 'success', is_error: true, result: 'Claude usage limit reached. Your limit will reset at 3am.' }));
    expect(limit.error).toMatchObject({ code: 'http', status: 429 });
    const gone = await step(w.client.stream(request([sys, user('hi')])), () => w.launches[3]!.process.end(null));
    expect(gone.error).toMatchObject({ code: 'connection', providerMessage: expect.stringContaining('Install Claude Code') });
    expect(failureOf('Invalid API key · Please run /login', null)).toMatchObject({ status: 401 });
    expect(failureOf('boom', 529)).toMatchObject({ code: 'http', status: 529 });
    expect(failureOf('boom', null)).toMatchObject({ code: 'unknown' });
    expect(w.clock.pendingCount()).toBe(0);
    expect(w.files.size).toBe(0);
  });

  it('renders a conversation for a process that was not there for it', () => {
    const messages: ChatMessage[] = [sys, user('one'), { role: 'assistant', content: [{ kind: 'text', text: 'two' }] }, user('three')];
    expect(renderHistory(messages)).toBe('<user>\none\n</user>\n<assistant>\ntwo\n</assistant>\n<user>\nthree\n</user>');
    const opening = openingContent(messages);
    expect(opening[0]).toMatchObject({ type: 'text', text: expect.stringContaining('<assistant>\ntwo\n</assistant>') });
    expect(opening[1]).toEqual({ type: 'text', text: 'three' });
    expect(openingContent([sys, { role: 'user', content: [{ kind: 'image', mediaType: 'image/png', base64: 'AAAA' }] }])).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }]);
  });
});

describe('the tool bridge (PD-PROVIDER-002 clause 3)', () => {
  it('serves one session\'s tools to the bearer it gave that session and to no one else, and hands a call to the handler', async () => {
    const bridge = new LoopbackToolBridge();
    const calls: unknown[] = [];
    const reg = await bridge.register({ tools: () => tools, call: async (c) => { calls.push(c); return { text: 'result text', isError: false }; } });
    const { url, headers } = reg.config.mcpServers['rotaris']!;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\/[0-9a-f]{32}$/);
    const post = async (body: unknown, h: Record<string, string> = headers, to = url) => fetch(to, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {})).status).toBe(401);
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers, url.replace(/[0-9a-f]{32}$/, '0'.repeat(32)))).status).toBe(404);
    expect((await fetch(url, { headers })).status).toBe(405);
    expect(await (await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25' } })).json()).toMatchObject({ result: { protocolVersion: '2025-11-25', capabilities: { tools: {} } } });
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect(await (await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()).toEqual({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'read_file', description: 'Reads a file', inputSchema: tools[0]!.parameters }] } });
    const called = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'a' }, _meta: { 'claudecode/toolUseId': 'toolu_5' } } })).json();
    expect(called).toEqual({ jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'result text' }], isError: false } });
    expect(calls).toEqual([{ callId: 'toolu_5', name: 'read_file', args: { path: 'a' } }]);
    expect(await (await post({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).json()).toMatchObject({ error: { code: -32601 } });
    reg.release();
    expect((await post({ jsonrpc: '2.0', id: 4, method: 'tools/list' })).status).toBe(404);
    await bridge.close();
  });
});
