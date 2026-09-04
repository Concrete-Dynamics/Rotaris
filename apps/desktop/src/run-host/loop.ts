import { isRungRejection, selectSlot, type ClassifierSlots, type LoopActivation, type RungMemory, type LoopClassification, type LoopClassifier, type Rung } from '@rotaris/engine';
import type { AgentBackend, ModelRef, OutputSpec, ThinkingLevel } from '@rotaris/model';

const LOOP_SCHEMA: Readonly<Record<string, unknown>> = {
  type: 'object', additionalProperties: false,
  required: ['loop_detected', 'reason', 'corrective_message'],
  properties: { loop_detected: { type: 'boolean' }, reason: { type: 'string' }, corrective_message: { type: 'string' } },
};

const SYSTEM_PROMPT = [
  'You classify an agent conversation for a repeated-work loop.',
  'Answer with loop_detected, a short reason, and a corrective_message of at most 90 words.',
  'The corrective_message uses natural user voice, redirects to a different concrete approach or asks for a viability assessment, and never mentions monitoring, detection, classification, or injection.',
].join(' ');

const outputFor = (rung: Rung): OutputSpec | undefined => rung === 'json_schema'
  ? { kind: 'json_schema', name: 'loop_classification', schema: LOOP_SCHEMA }
  : rung === 'json_object' ? { kind: 'json_object' } : undefined;

function parse(text: string): LoopClassification | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (typeof value['loop_detected'] !== 'boolean' || typeof value['reason'] !== 'string' || typeof value['corrective_message'] !== 'string') return null;
    return { loop_detected: value['loop_detected'], reason: value['reason'], corrective_message: value['corrective_message'] };
  } catch { return null; }
}

export interface LoopClassifierDeps {
  readonly backend: AgentBackend;
  readonly runModel: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly resolveCredential: () => Promise<string>;
  readonly memory: RungMemory;
  /** `circuit_breaker.model` resolved to a reference, or the small slot when it named the alias. */
  readonly configuredModel: ModelRef | null;
  readonly slots: ClassifierSlots;
  readonly modelTimeoutMs: number;
}

/** REQ-ORCH-100/103: the small-slot classifier behind the engine's port. */
export function createLoopClassifier(deps: LoopClassifierDeps): LoopClassifier | null {
  const selected = deps.configuredModel ? { model: deps.configuredModel, slot: 'small_model' as const } : selectSlot(deps.slots);
  if (!selected) return null;

  return {
    async classify(activation: LoopActivation, signal: AbortSignal): Promise<LoopClassification> {
      const prompt = `Trigger: ${activation.trigger} (${activation.reason}).\nRecent conversation:\n${activation.excerpt}`;
      for (const rung of deps.memory.ladder(selected.model.modelId)) {
        const output = outputFor(rung);
        const report = await deps.backend.runTurn({
          persona: 'loop-supervisor', systemPrompt: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [{ kind: 'text', text: prompt }] }], tools: [], model: selected.model,
          thinking: deps.thinking, timeoutMs: deps.modelTimeoutMs, retries: 0, resolveCredential: deps.resolveCredential,
          ...(output ? { output } : {}),
        }, { delta: () => undefined, reasoning: () => undefined, usage: () => undefined }, signal);
        if (report.status === 'failed') {
          if (isRungRejection(report.error)) { deps.memory.reject(selected.model.modelId, rung); continue; }
          throw new Error(report.error.headline);
        }
        const parsed = parse(report.text);
        if (parsed) return parsed;
      }
      throw new Error('the loop classifier returned no valid contract');
    },
  };
}
