import type { AgentBackend, ChatMessage, ModelClient, ToolCallRequest, TurnInput, TurnReport, TurnSink, Usage } from './ports.js';

/**
 * The default `AgentBackend`: ONE streaming call over `ModelClient` per step, the engine driving the
 * loop (REQ-ORCH-146's non-native case). Text deltas go to the sink as they arrive; tool-call parts are
 * assembled by call id (a provider may stream the arguments in pieces); the report carries the whole
 * text, the tool calls requested, the provider's usage, and the finish reason folded into the status.
 */
export class DefaultAgentBackend implements AgentBackend {
  readonly ownsTheLoop = false;

  constructor(private readonly client: ModelClient) {}

  async runTurn(input: TurnInput, sink: TurnSink, signal: AbortSignal): Promise<TurnReport> {
    const messages: ChatMessage[] = [
      { role: 'system', content: [{ kind: 'text', text: input.systemPrompt }] },
      ...input.messages,
    ];
    let text = '';
    let usage: Usage = { input: 0, output: 0 };
    let finish: 'stop' | 'length' | 'other' | null = null;
    const calls = new Map<string, { name: string; args: string }>();
    let started = false;
    for await (const part of this.client.stream({
      model: input.model, messages, thinking: input.thinking, signal,
      timeoutMs: input.timeoutMs, retries: input.retries, onRetry: (r) => sink.retried?.(r), resolveCredential: input.resolveCredential, tools: input.tools, ...(input.output ? { output: input.output } : {}),
    })) {
      // REQ-ORCH-090: any part — a delta, a tool call, an error the provider answered with — is a model event.
      if (!started) { started = true; sink.started?.(); }
      sink.event?.(part.ok ? part.value.kind : 'error');
      if (!part.ok) return { status: 'failed', text, usage, error: part.error, toolCalls: [...calls].map(([callId, c]) => ({ callId, ...c })) };
      switch (part.value.kind) {
        case 'text':
          text += part.value.delta;
          sink.delta(part.value.delta);
          break;
        case 'reasoning':
          sink.reasoning(part.value.delta);
          break;
        case 'usage':
          usage = part.value.usage;
          sink.usage(usage);
          break;
        case 'finish':
          finish = part.value.reason;
          break;
        case 'tool-input':
          // A call under way: a model event (above) and nothing to assemble; its arguments arrive whole as `tool-call`.
          break;
        case 'tool-call': {
          const cur = calls.get(part.value.callId);
          if (cur) cur.args += part.value.argsDelta;
          else calls.set(part.value.callId, { name: part.value.name, args: part.value.argsDelta });
          break;
        }
      }
    }
    const toolCalls: ToolCallRequest[] = [...calls].map(([callId, c]) => ({ callId, name: c.name, args: c.args }));
    if (finish === 'length') return { status: 'partial', text, usage, toolCalls };
    return { status: 'succeeded', text, usage, toolCalls };
  }
}
