import type { AgentBackend, ChatMessage, ModelClient, TurnInput, TurnReport, TurnSink, Usage } from './ports.js';

/**
 * The default `AgentBackend`: one streaming call over `ModelClient`, the
 * engine driving the loop (REQ-ORCH-146's non-native case). Text deltas go to
 * the sink as they arrive; the report carries the whole text, the provider's
 * usage, and the finish reason folded into the status.
 *
 * No tools yet: a `tool-call` part is carried through as nothing (the tool
 * surface lands with ADR-0016 to ADR-0019). Reasoning parts reach the sink and
 * are not part of the text.
 */
export class DefaultAgentBackend implements AgentBackend {
  readonly ownsTheLoop = false;

  constructor(private readonly client: ModelClient) {}

  async runTurn(input: TurnInput, sink: TurnSink, signal: AbortSignal): Promise<TurnReport> {
    const messages: ChatMessage[] = [
      { role: 'system', content: [{ kind: 'text', text: input.systemPrompt }] },
      ...input.history,
      { role: 'user', content: [{ kind: 'text', text: input.task }] },
    ];
    let text = '';
    let usage: Usage = { input: 0, output: 0 };
    let finish: 'stop' | 'length' | 'other' | null = null;
    for await (const part of this.client.stream({
      model: input.model, messages, thinking: input.thinking, signal,
      timeoutMs: input.timeoutMs, retries: input.retries, resolveCredential: input.resolveCredential,
    })) {
      if (!part.ok) return { status: 'failed', text, usage, error: part.error };
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
        case 'tool-call':
          break;
      }
    }
    if (finish === 'length') return { status: 'partial', text, usage };
    return { status: 'succeeded', text, usage };
  }
}
