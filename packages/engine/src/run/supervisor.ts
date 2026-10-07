import { millis, type SessionId, type Timers } from '@rotaris/kernel';

export type ActivationMode = 'independent' | 'weighted';

export interface SupervisorConfig {
  readonly enabled: boolean;
  readonly activationMode: ActivationMode;
  readonly toolThreshold: number;
  readonly messageThreshold: number;
  readonly toolWeight: number;
  readonly messageWeight: number;
  readonly targetScore: number;
  readonly eventWindow: number;
  readonly excerptCap: number;
  readonly repetitionThreshold: number;
  readonly cycleThreshold: number;
  readonly classificationTimeoutMs: number;
}

export const SUPERVISOR_DEFAULTS: SupervisorConfig = {
  enabled: true,
  activationMode: 'independent',
  toolThreshold: 60,
  messageThreshold: 60,
  toolWeight: 0.6,
  messageWeight: 0.4,
  targetScore: 1,
  eventWindow: 24,
  excerptCap: 8_000,
  repetitionThreshold: 4,
  cycleThreshold: 3,
  classificationTimeoutMs: 2_000,
};

export type SupervisorEvent =
  | { readonly kind: 'tool'; readonly name: string; readonly args: string }
  | { readonly kind: 'message'; readonly text: string };

export interface LoopClassification {
  readonly loop_detected: boolean;
  readonly reason: string;
  readonly corrective_message: string;
}

export interface LoopActivation {
  readonly trigger: 'repetition' | 'cycle' | 'raw-count' | 'stuck';
  readonly reason: string;
  readonly events: readonly SupervisorEvent[];
  readonly excerpt: string;
  readonly activationCount: number;
}

export interface LoopClassifier {
  classify(activation: LoopActivation, signal: AbortSignal): Promise<LoopClassification>;
}

export interface SupervisorEscalation {
  readonly sessionId: SessionId;
  readonly activationCount: number;
  readonly reason: 'repeated-loop';
}

export type SupervisorDecision =
  | { readonly kind: 'continue' }
  | { readonly kind: 'inject'; readonly message: string; readonly activation: LoopActivation }
  | { readonly kind: 'escalate'; readonly signal: SupervisorEscalation; readonly activation: LoopActivation };

type Trigger = Pick<LoopActivation, 'trigger' | 'reason'>;

const normaliseMessage = (text: string): string => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const fingerprint = (event: SupervisorEvent): string => event.kind === 'tool'
  ? `tool\0${event.name}\0${event.args}`
  : `message\0${event.text}`;

function pathAnchor(events: readonly SupervisorEvent[]): string {
  const tool = [...events].reverse().find((event): event is Extract<SupervisorEvent, { kind: 'tool' }> => event.kind === 'tool');
  if (!tool) return 'the current task';
  const path = /(?:[A-Za-z]:[\\/]|\.{0,2}[\\/])[^"'\s,}]+|[^"'\s,}]+\.[A-Za-z0-9]{1,8}/.exec(tool.args)?.[0];
  return path ? `${tool.name} around ${path}` : `${tool.name} with ${tool.args.slice(0, 80) || 'the same arguments'}`;
}

function deterministicMessage(activation: LoopActivation): string {
  return `Pause and reassess ${pathAnchor(activation.events)}. State what changed, choose a different concrete approach, and check its viability before acting again.`;
}

function atMostNinetyWords(message: string): string {
  return message.trim().split(/\s+/).filter(Boolean).slice(0, 90).join(' ');
}

/** REQ-ORCH-099..107: one invisible observer for one agent conversation. */
export class LoopSupervisor {
  private events: SupervisorEvent[] = [];
  private toolCount = 0;
  private messageCount = 0;
  private consecutiveActivations = 0;
  private pending: Trigger | null = null;

  constructor(
    readonly sessionId: SessionId,
    private readonly config: SupervisorConfig,
    private readonly classifier: LoopClassifier,
    private readonly timers: Timers,
  ) {}

  observe(event: SupervisorEvent): void {
    this.events.push(event);
    if (this.events.length > this.config.eventWindow) this.events.shift();
    if (event.kind === 'tool') this.toolCount += 1;
    else this.messageCount += 1;
    this.pending ??= this.trigger();
  }

  /** REQ-ORCH-096: the runtime's stuck report enters the same activation counter. */
  observeStuck(reason = 'the agent reported that it cannot make progress'): void {
    this.pending ??= { trigger: 'stuck', reason };
  }

  /** A real prompt, steering instruction or todo correction starts a fresh consecutive series. */
  noteUserInstruction(): void {
    this.consecutiveActivations = 0;
  }

  async check(): Promise<SupervisorDecision> {
    const trigger = this.pending;
    if (!trigger) return { kind: 'continue' };

    this.consecutiveActivations += 1;
    const activation: LoopActivation = {
      ...trigger,
      events: [...this.events],
      excerpt: this.excerpt(),
      activationCount: this.consecutiveActivations,
    };
    this.resetWindow();

    if (this.consecutiveActivations > 2) {
      return { kind: 'escalate', activation, signal: { sessionId: this.sessionId, activationCount: this.consecutiveActivations, reason: 'repeated-loop' } };
    }

    const classified = await this.classifyWithinBound(activation);
    if (trigger.trigger === 'stuck') {
      return { kind: 'inject', activation, message: classified?.corrective_message.trim() ? atMostNinetyWords(classified.corrective_message) : deterministicMessage(activation) };
    }
    if (classified) {
      if (!classified.loop_detected) return { kind: 'continue' };
      const message = classified.corrective_message.trim();
      return { kind: 'inject', activation, message: message ? atMostNinetyWords(message) : deterministicMessage(activation) };
    }

    if (trigger.trigger === 'repetition' || trigger.trigger === 'cycle' || this.rawFallbackHasEvidence(activation.events)) {
      return { kind: 'inject', activation, message: deterministicMessage(activation) };
    }
    return { kind: 'continue' };
  }

  private trigger(): Trigger | null {
    // REQ-ORCH-101's first two triggers are over ACTIONS: the assistant text between two identical tool
    // calls neither breaks "in a row" nor makes a (text, call) pair a cycle. Messages count toward the raw
    // thresholds and REQ-ORCH-104's evidence only. (First execution: with messages in the fingerprint
    // series a pure repetition fired "repeated cycle", and a repetition with varying text fired nothing.)
    const prints = this.events.filter((event) => event.kind === 'tool').map(fingerprint);
    const n = this.config.repetitionThreshold;
    if (prints.length >= n && new Set(prints.slice(-n)).size === 1) return { trigger: 'repetition', reason: 'repeated action' };

    for (let width = 2; width <= 4; width += 1) {
      const needed = width * this.config.cycleThreshold;
      if (prints.length < needed) continue;
      const tail = prints.slice(-needed);
      const unit = tail.slice(0, width);
      if (new Set(unit).size !== width) continue;
      if (tail.every((value, index) => value === unit[index % width])) return { trigger: 'cycle', reason: 'repeated cycle' };
    }

    if (this.config.activationMode === 'independent') {
      if (this.toolCount >= this.config.toolThreshold || this.messageCount >= this.config.messageThreshold) return { trigger: 'raw-count', reason: 'raw event threshold' };
    } else {
      const score = (this.toolCount / this.config.toolThreshold) * this.config.toolWeight
        + (this.messageCount / this.config.messageThreshold) * this.config.messageWeight;
      if (score >= this.config.targetScore) return { trigger: 'raw-count', reason: 'weighted event threshold' };
    }
    return null;
  }

  /**
   * REQ-ORCH-104's raw-count fallback: "repeated identical assistant messages (last 3 normalized-equal) or ≥ 4 consecutive
   * same-tool calls — never from counts alone". The turn observes every model step's text, `''` for a step that only called
   * tools, so a message that normalises to nothing is no assistant message and never evidence: three tool-only steps are
   * three steps with no message, not three identical ones (live-run finding D3, the repair of
   * `tool-only-steps-read-as-three-identical-messages.md`). The last three messages are the last three with text.
   *
   * PD-ORCH-016 (OQ-232, ruled 2026-10-07 under R-072) narrows the tool limb: the last four tool calls are evidence only when
   * they are the same action by REQ-ORCH-101's comparison — the tool name and the whole arguments (`fingerprint`), none of
   * them disregarded. Calls of one tool with differing arguments are counts alone, whatever the tool's facet; assistant text
   * between the calls still does not break the run. The reason it compared names, kept beside its replacement: ADR-0059
   * decision 5 read "same-tool" as the tool's name, and its first live firing, at the duress run at `a68f121` (finding D6),
   * was four reads of two files by a child checking its own document, told to "Pause and reassess".
   */
  private rawFallbackHasEvidence(events: readonly SupervisorEvent[]): boolean {
    const messages = events.flatMap((event) => (event.kind === 'message' && normaliseMessage(event.text) !== '' ? [normaliseMessage(event.text)] : []));
    if (messages.length >= 3 && new Set(messages.slice(-3)).size === 1) return true;
    const tools = events.filter((event) => event.kind === 'tool');
    return tools.length >= 4 && new Set(tools.slice(-4).map(fingerprint)).size === 1;
  }

  private excerpt(): string {
    const text = this.events.map((event) => event.kind === 'message'
      ? `assistant: ${event.text}`
      : `tool: ${event.name} ${event.args}`).join('\n');
    return text.length <= this.config.excerptCap ? text : text.slice(-this.config.excerptCap);
  }

  private resetWindow(): void {
    this.events = [];
    this.toolCount = 0;
    this.messageCount = 0;
    this.pending = null;
  }

  private classifyWithinBound(activation: LoopActivation): Promise<LoopClassification | null> {
    const controller = new AbortController();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: LoopClassification | null) => {
        if (settled) return;
        settled = true;
        timer.cancel();
        resolve(value);
      };
      const timer = this.timers.after(millis(this.config.classificationTimeoutMs), () => {
        controller.abort();
        finish(null);
      });
      this.classifier.classify(activation, controller.signal).then((value) => finish(value), () => finish(null));
    });
  }
}

/** REQ-ORCH-105/151: a registry owned by exactly one session/run. */
export class SupervisorRegistry {
  private readonly conversations = new Map<string, LoopSupervisor>();

  constructor(
    readonly sessionId: SessionId,
    private readonly config: SupervisorConfig,
    private readonly classifier: LoopClassifier,
    private readonly timers: Timers,
  ) {}

  forConversation(id: string): LoopSupervisor {
    let supervisor = this.conversations.get(id);
    if (!supervisor) {
      supervisor = new LoopSupervisor(this.sessionId, this.config, this.classifier, this.timers);
      this.conversations.set(id, supervisor);
    }
    return supervisor;
  }
}
