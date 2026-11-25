import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  INBOUND_TOOL_NAMES,
  InboundRunStatusInputSchema,
  InboundStartRunInputSchema,
  isInboundToolName,
  type InboundAskHandler,
  type InboundRunStatus,
  type InboundToolName,
} from '@rotaris/contracts';
import { checkInboundRequest, type InboundToken } from './guards.js';

/** REQ-MCP-123: the two tools' output shapes, as `tools/call` reports them under `structuredContent`. */
const StartRunOutputSchema = z.object({ run: z.string(), sessionId: z.string() });
const RunStatusOutputSchema = z.object({ run: z.string(), sessionId: z.string(), state: z.string(), stopReason: z.string().nullable() });

/**
 * THE INBOUND SURFACE, as a fetch-shaped MCP handler (ADR-0067; REQ-MCP-119/121/122/123). This is the pure core of the
 * listener: it holds no socket, forks nothing and reaches no process — the listener's `utilityProcess` entry wraps it in
 * a loopback HTTP server, and every test drives it by `fetch` with a `Request`.
 *
 * Three things happen in a fixed order, and the order is the requirement:
 *
 * 1. **`Host` and `Origin` against loopback** (REQ-MCP-122) — refused with 403 BEFORE the request is served; a missing
 *    `Origin` from a native client is allowed, a foreign one refused, and a non-loopback `Host` refused.
 * 2. **The bearer token** (REQ-MCP-121) — missing, malformed or wrong, refused with 401 and never reaching the run host.
 * 3. **The MCP exchange** over the SDK's streamable-HTTP handler, whose `tools/list` advertises exactly the two tools of
 *    `INBOUND_TOOL_NAMES` and whose `tools/call` reduces a call to the one ask main answers.
 *
 * The registry is built from `INBOUND_TOOL_NAMES`, so a third tool is an edit in `contracts/inbound.ts` and nowhere else.
 */

/** The version this surface reports as its own, in the MCP handshake. */
export const INBOUND_SERVER_INFO = { name: 'rotaris', version: '1' } as const;

/** Who served a request was refused, for the listener's log line alone — never a body, never a header value. */
export type InboundRefusalLog = (message: string, level: 'info' | 'warn') => void;

/** What the surface needs: the token in force, the ask that reaches main, and a log sink. */
export interface InboundSurfaceDeps {
  readonly token: InboundToken;
  readonly ask: InboundAskHandler;
  readonly log: InboundRefusalLog;
}

/** The two tool names as they are registered, in the order the surface advertises them. */
export function inboundToolNames(): readonly InboundToolName[] {
  return INBOUND_TOOL_NAMES;
}

/** REQ-MCP-122/121: the 403 body, as the SDK's own host/origin helpers shape it (JSON-RPC error, status 403). */
function forbiddenResponse(message: string): Response {
  return Response.json({ jsonrpc: '2.0', error: { code: -32_000, message }, id: null }, { status: 403, headers: { 'Content-Type': 'application/json' } });
}

function unauthorizedResponse(message: string): Response {
  return Response.json({ jsonrpc: '2.0', error: { code: -32_000, message }, id: null }, { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' } });
}

/**
 * REQ-MCP-123: one tool call reduced to the ask main answers, and main's answer rendered as a tool result. Pure over the
 * ask — so a test drives both tools with no server and no HTTP, and the refusal reason a caller sees is main's own words.
 */
export async function callInboundTool(ask: InboundAskHandler, name: string, args: unknown): Promise<{ readonly isError: boolean; readonly text: string; readonly structured?: unknown }> {
  if (!isInboundToolName(name)) return { isError: true, text: `No tool named ${name} is served by this surface.` };
  if (name === 'rotaris_start_run') {
    // REQ-MCP-124: the strict schema refuses an unknown field (an authority field among them) rather than ignoring it.
    const parsed = InboundStartRunInputSchema.safeParse(args);
    if (!parsed.success) return { isError: true, text: startRunInputRefusal(parsed.error.issues) };
    const answer = await ask({ kind: 'inbound.startRun', prompt: parsed.data.prompt });
    if (answer.kind !== 'inbound.runStarted') return { isError: true, text: answer.kind === 'refused' ? refusedText(answer) : 'The run could not be started.' };
    return { isError: false, text: JSON.stringify({ run: answer.run, sessionId: answer.sessionId }), structured: { run: answer.run, sessionId: answer.sessionId } };
  }
  const parsed = InboundRunStatusInputSchema.safeParse(args);
  if (!parsed.success) return { isError: true, text: 'A run handle is required: pass the value `rotaris_start_run` returned as `run`.' };
  const answer = await ask({ kind: 'inbound.runStatus', run: parsed.data.run });
  if (answer.kind !== 'inbound.runStatus') return { isError: true, text: answer.kind === 'refused' ? refusedText(answer) : 'The run’s state could not be read.' };
  return { isError: false, text: statusText(answer.status), structured: statusStructured(answer.status) };
}

/** A refusal's own words, joined as every other surface joins them (headline, then detail). */
function refusedText(refusal: { readonly headline: string; readonly detail?: string | undefined }): string {
  return [refusal.headline, refusal.detail].filter((s): s is string => typeof s === 'string' && s !== '').join(': ');
}

/** REQ-MCP-124: what a caller is told when their input carries a field the surface does not accept — the field is named, and so is the reason it is refused. */
function startRunInputRefusal(issues: readonly { readonly code: string; readonly keys?: readonly string[]; readonly path: readonly PropertyKey[]; readonly message: string }[]): string {
  const unrecognized = issues.filter((i) => i.code === 'unrecognized_keys').flatMap((i) => i.keys ?? []);
  if (unrecognized.length > 0) {
    return `This surface starts a run with a prompt alone and never lets a caller set an execution field. Refused: the call carries ${unrecognized.length === 1 ? 'a field' : 'fields'} it does not accept (${unrecognized.join(', ')}); each is a field that would mean a stronger run or a workspace the caller chose, and each is refused rather than ignored.`;
  }
  return 'This surface starts a run with a prompt alone; the call carried none or one that is not text.';
}

/** REQ-MCP-123/130: the status in the product's own vocabulary, as text for the caller's transcript. */
export function statusText(status: InboundRunStatus): string {
  const reason = status.stopReason === null ? 'the run has not stopped' : `it stopped: ${status.stopReason}`;
  return JSON.stringify({ run: status.run, sessionId: status.sessionId, state: status.state, stopReason: status.stopReason, summary: `${status.state}; ${reason}` });
}

function statusStructured(status: InboundRunStatus): unknown {
  return { run: status.run, sessionId: status.sessionId, state: status.state, stopReason: status.stopReason };
}

/**
 * The surface: a `fetch`-shaped handler over the SDK's streamable-HTTP entry, with the two guards in front. `close`
 * tears the handler's modern leg down, so an unbind leaves nothing running behind it.
 */
export function createInboundSurface(deps: InboundSurfaceDeps): { readonly fetch: (request: Request) => Promise<Response>; readonly close: () => Promise<void> } {
  const handler = createMcpHandler(() => {
    const server = new McpServer(INBOUND_SERVER_INFO);
    // REQ-MCP-123/124: the two tools, both strict, neither with an authority field.
    server.registerTool(
      'rotaris_start_run',
      {
        title: 'Start a run',
        description: 'Start a run of the Rotaris workspace the desktop has open, and return its handle. The prompt is the only thing a caller may set: the workspace, the sandbox mode, the permission model and the run type come from the open desktop session and are never chosen here. At most one externally started run is active at a time; a call while one is active is refused with a stated reason and never queued.',
        inputSchema: InboundStartRunInputSchema,
        outputSchema: StartRunOutputSchema,
      },
      async (args) => toolResult(await callInboundTool(deps.ask, 'rotaris_start_run', args)),
    );
    server.registerTool(
      'rotaris_run_status',
      {
        title: 'Read a run’s status',
        description: 'Read the state and the stop reason of a run this surface started, in the product’s own status vocabulary. Only a handle `rotaris_start_run` returned is answered; another session’s id is not.',
        inputSchema: InboundRunStatusInputSchema,
        outputSchema: RunStatusOutputSchema,
      },
      async (args) => toolResult(await callInboundTool(deps.ask, 'rotaris_run_status', args)),
    );
    return server;
  }, { onerror: (error) => deps.log(`inbound surface: ${error.message}`, 'warn') });

  return {
    fetch: async (request: Request): Promise<Response> => {
      // 1. REQ-MCP-122: Origin and Host against loopback, before anything is served.
      const guard = checkInboundRequest({ host: request.headers.get('host'), origin: request.headers.get('origin') });
      if (!guard.ok) {
        deps.log(`inbound surface refused a request: ${guard.detail} (${guard.reason}, REQ-MCP-122)`, 'warn');
        return forbiddenResponse('Forbidden: this surface serves loopback only.');
      }
      // 2. REQ-MCP-121: the bearer token, before the request reaches the run host.
      if (!deps.token.accepts(request.headers.get('authorization'))) {
        deps.log('inbound surface refused a request: no valid bearer token (REQ-MCP-121)', 'warn');
        return unauthorizedResponse('Unauthorized: a current bearer token is required.');
      }
      // 3. The exchange itself.
      return handler.fetch(request);
    },
    close: () => handler.close(),
  };
}

/** One tool result: the text a caller reads, and the structured content when the call produced a shape. */
function toolResult(outcome: { readonly isError: boolean; readonly text: string; readonly structured?: unknown }): { readonly content: { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean; readonly structuredContent?: Record<string, unknown> } {
  const base = { content: [{ type: 'text' as const, text: outcome.text }] };
  if (outcome.isError) return { ...base, isError: true };
  return outcome.structured === undefined ? base : { ...base, structuredContent: outcome.structured as Record<string, unknown> };
}
