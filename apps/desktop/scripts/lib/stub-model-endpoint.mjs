/**
 * A loopback OpenAI-compatible chat-completions endpoint, for ADR-0056 rule 4 (b): `scripts/package.mjs`'s launch of the
 * packaged application reaches it through the product's own model client (`AiSdkModelClient`), as a person's configured
 * provider is reached, so the rule proves the client that ships rather than a stand-in compiled out of it.
 *
 * OQ-312 (ruled 2026-10-14 under R-072, no directive): a packaged build answers no `provider: scripted` entry; the scripted
 * client is compiled out with the other verification seams, and rule 4 (b) is re-based on this stub, which the packaging
 * script starts itself. Until then rule 4 (b) reached the scripted client through a `provider: scripted` configuration, which
 * kept the client, and a fixed one-step script, in every shipped build
 * (docs/defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md).
 *
 * It answers `POST <base>/chat/completions` (`stream: true` as server-sent events, otherwise one JSON body) by what the request
 * carries, never by a script:
 *   - `response_format` (a classifier's structured rung): one fixed valid classification — the loop classifier's object for
 *     a schema requiring `loop_detected`, the intent classifier's (`moderate_feature`) for any other;
 *   - tools offering `terminal`, with a last message that is not a tool result: one streamed `terminal` call, `git status`;
 *   - anything else: a short text reply.
 * It counts the requests, the requests that carried tools, the terminal calls it sent and the classifications it answered.
 * It listens on 127.0.0.1 at a port the system picks, and asks for no credential: the caller's `api_key` is a placeholder.
 */
import { createServer } from 'node:http';

export const STUB_TERMINAL_COMMAND = 'git status';
export const STUB_REPLY = 'The stub model read the result.';
export const STUB_INTENT = { intent: 'moderate_feature', confidence: 0.9, reason: 'The stub endpoint classifies every request alike.' };
export const STUB_LOOP = { loop_detected: false, reason: 'The stub endpoint sees no loop.', corrective_message: '' };

/** What one request is answered with: `{ kind: 'text', text }` or `{ kind: 'tool', name, args }`. */
export function answerFor(body) {
  const format = body && typeof body === 'object' ? body.response_format : undefined;
  if (format !== undefined && format !== null) {
    // The AI SDK names every schema `response`, so the loop classifier's is told by the field it requires.
    const schema = format.json_schema && typeof format.json_schema === 'object' ? format.json_schema.schema : undefined;
    const loop = schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object' && 'loop_detected' in schema.properties;
    return { kind: 'classification', text: JSON.stringify(loop ? STUB_LOOP : STUB_INTENT) };
  }
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const last = messages.at(-1);
  const offersTerminal = tools.some((t) => t?.function?.name === 'terminal');
  if (offersTerminal && last?.role !== 'tool') return { kind: 'tool', name: 'terminal', args: JSON.stringify({ command: STUB_TERMINAL_COMMAND }) };
  return { kind: 'text', text: STUB_REPLY };
}

const chunk = (model, delta, finish, usage) => JSON.stringify({
  id: 'stub', object: 'chat.completion.chunk', created: 0, model,
  choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}),
});
const USAGE = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

/**
 * Starts the endpoint. Resolves with its `baseUrl` (`http://127.0.0.1:<port>/v1`), its live `counts` and `close()`.
 * @returns {Promise<{ baseUrl: string, port: number, counts: { requests: number, toolsRequests: number, terminalCalls: number, classifications: number }, close: () => Promise<void> }>}
 */
export async function startStubModelEndpoint() {
  const counts = { requests: 0, toolsRequests: 0, terminalCalls: 0, classifications: 0 };
  let calls = 0;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method !== 'POST' || !(req.url ?? '').endsWith('/chat/completions')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `the stub answers POST /v1/chat/completions only, not ${req.method} ${req.url}` } }));
        return;
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'the request body is not JSON' } }));
        return;
      }
      counts.requests += 1;
      if (Array.isArray(body.tools) && body.tools.length > 0) counts.toolsRequests += 1;
      const answer = answerFor(body);
      const model = typeof body.model === 'string' ? body.model : 'stub';
      if (answer.kind === 'tool') { counts.terminalCalls += 1; calls += 1; }
      if (answer.kind === 'classification') counts.classifications += 1;
      const callId = `call_stub_${calls}`;
      if (body.stream !== true) {
        const message = answer.kind === 'tool'
          ? { role: 'assistant', content: null, tool_calls: [{ id: callId, type: 'function', function: { name: answer.name, arguments: answer.args } }] }
          : { role: 'assistant', content: answer.text };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'stub', object: 'chat.completion', created: 0, model, choices: [{ index: 0, message, finish_reason: answer.kind === 'tool' ? 'tool_calls' : 'stop' }], usage: USAGE }));
        return;
      }
      const events = answer.kind === 'tool'
        ? [
          chunk(model, { role: 'assistant', tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: answer.name, arguments: '' } }] }, null),
          chunk(model, { tool_calls: [{ index: 0, function: { arguments: answer.args } }] }, null),
          chunk(model, {}, 'tool_calls', USAGE),
        ]
        : [chunk(model, { role: 'assistant', content: answer.text }, null), chunk(model, {}, 'stop', USAGE)];
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.end(`${[...events, '[DONE]'].map((e) => `data: ${e}\n\n`).join('')}`);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    port,
    counts,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve(undefined)); }),
  };
}
