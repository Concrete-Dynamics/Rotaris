import { type Clocks, countNoun, millis, type Millis, type Timers } from '@rotaris/kernel';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { SessionWriter } from '../session-writer.js';
import { estimateTokens, preservedFrom, type Conversation } from './conversation.js';
import type { ConversationRegistry, ManualCompressionResult } from './conversations.js'; // Part AO

/**
 * ADR-0060 — context compression: the bounded pass that writes the summary, and the reconstruction
 * `REQ-MONITOR-084` fixes. Nothing here reads a clock or touches the store; `turn.ts` drives it at the
 * threshold (`REQ-MONITOR-076`) and `ladder.ts` at a context-window rejection (`REQ-ORCH-093`).
 *
 * The compressing model is told ONLY the compressible slice — what lies between the original request and
 * the preserved turns — because `REQ-MONITOR-082` states that the system prompt, the tool definitions and
 * the original request survive character for character and that none of the three is sent to it.
 */

/** `REQ-MONITOR-083`: the bound applies to the generated summary ALONE and to nothing else. */
export const SUMMARY_LINE_CAP = 300;
/** `REQ-CONFIG-132`: `compressor.timeout_seconds`, default 120. */
export const COMPRESSION_TIMEOUT_MS = millis(120_000);

export interface CompressorDeps {
  readonly backend: AgentBackend;
  /** `REQ-MONITOR-080`: `compressor.model` when configured, else the agent's own — reachable by construction. */
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly timers: Timers;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly timeoutMs?: Millis;
  /**
   * OQ-153: the most of the history the pass is given, in tokens — the compressing model's own effective threshold
   * (REQ-MONITOR-078, its `ResolvedTrigger.tokens`), read at `chars_per_token`. Absent, the history is given whole.
   */
  readonly inputTokens?: number | undefined;
}

export interface CompressionOutcome {
  readonly ok: boolean;
  /** Why it did not happen; empty when it did. */
  readonly reason: string;
  /**
   * TRUE when there was simply nothing to compress — everything after the original request is inside the
   * preserved turns. That is not a failure and is not recorded as one: the condition persists for as long as
   * the count stays over the threshold, so recording it would put a warning issue on every remaining model
   * step of the run. Found by the first live run against a real provider (ADR-0060's first execution).
   */
  readonly nothingToDo: boolean;
  readonly beforeTokens: number;
  readonly afterTokens: number;
  /**
   * The message counts either side. The TOKEN figures can rise on a very small conversation — the summary and
   * its framing have a floor that a three-message history is already under — so what a reader should judge a
   * compression by is how much history it removed, which is these two. Stated in ADR-0060's first execution.
   */
  readonly beforeMessages: number;
  readonly afterMessages: number;
  readonly summary: string;
}

const SYSTEM = 'You condense an agent conversation so the agent can carry on with a shorter history. Report only what already happened; never continue the task, never invent work, never address the user.';

/** `REQ-MONITOR-083`: the summary, and only the summary, cut to 300 lines. */
export function clampSummary(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= SUMMARY_LINE_CAP) return text.trim();
  return `${lines.slice(0, SUMMARY_LINE_CAP).join('\n').trim()}\n[the summary was cut at ${SUMMARY_LINE_CAP} lines; ${countNoun(lines.length - SUMMARY_LINE_CAP, 'further line')} omitted]`;
}

/** One event of the history as one line of text, whole: an agent's words, a tool call with its arguments, a tool's result. */
function eventText(m: ChatMessage): string[] {
  return m.content.map((p) => (p.kind === 'text' ? `${m.role}: ${p.text}` : p.kind === 'tool-call' ? `tool-call ${p.name}: ${p.args}` : p.kind === 'tool-result' ? `tool-result ${p.name}: ${p.result}` : '')).filter((t) => t !== '');
}

/** OQ-111's omission marker, which this reader shares: how many characters were left out where it stands. */
function omitted(n: number): string {
  return `… [${n} characters omitted] …`;
}

/**
 * `REQ-MONITOR-082` as OQ-153 reads it: the history the compressing model condenses, as text, each event whole. It is
 * the whole of what the summary stands in for; only where it passes `capChars` — the compressing model's own threshold,
 * which a history at the agent's own trigger is under whenever the compressing model is the agent's own — it keeps its
 * START (a previous compression's summary, when there was one, else the agent's first act) and its MOST RECENT part,
 * the part the preserved turns carry on from, with the omission marked between them and saying how much was left out.
 * The start is held to half the cap, so the most recent part always has the other half; where the most recent part is
 * shorter than that half it is given whole and the start has the rest of the cap. A cap shorter than two omission
 * markers (some 60 characters) is not met: the markers alone pass it. Only a pathological threshold — a few tokens —
 * resolves to such a cap, so no floor is set; what the cap bounds is the history's text, not the markers about it.
 *
 * The reason it did not, kept beside its replacement: it read `transcriptText`, the report pass's reader, which cuts each
 * event to REQ-ORCH-110's 2,000 characters and the whole to its 12,000 from the head. At the default trigger (60 % of
 * 265,000 tokens at 4 characters each) the history is some 636,000 characters, so the model saw its first 2 % and the
 * rest was removed from the conversation absent from its summary (acceptance finding A12).
 */
export function compressorTranscript(messages: readonly ChatMessage[], capChars = Number.POSITIVE_INFINITY): string {
  const parts = messages.flatMap(eventText);
  const whole = parts.join('\n');
  if (whole.length <= capChars) return whole;
  const cap = Math.floor(capChars);
  // One event alone keeps its head.
  if (parts.length < 2) return headOf(whole, cap);
  const half = Math.floor(cap / 2);
  const first = parts[0] ?? '';
  const rest = parts.slice(1).join('\n');
  // The start is held to half the cap — unless the most recent part fits whole in less than the other half, when
  // the start has what the most recent part leaves (never a budget left unused, never a marker where nothing is left out).
  const head = first.length <= half ? first : headOf(first, Math.max(half, cap - rest.length - 1));
  if (head.length + 1 + rest.length <= cap) return `${head}\n${rest}`;
  // The marker's length depends on the count it states, never more than `rest`'s own length: reserve that widest marker.
  // `keep` is below `rest.length` here, since `head`, a line break and the whole `rest` do not fit.
  const keep = Math.max(0, cap - head.length - omitted(rest.length).length - 2);
  return `${head}\n${omitted(rest.length - keep)}\n${rest.slice(rest.length - keep)}`;
}

/** `text`'s head within `room` characters, its omission marked with the count left out. */
function headOf(text: string, room: number): string {
  const kept = Math.max(0, room - omitted(text.length).length);
  return `${text.slice(0, kept)}${omitted(text.length - kept)}`;
}

/**
 * `REQ-MONITOR-084`: after compression the context holds exactly these parts, in exactly this order, and
 * nothing else from the pre-compression history — (2) the user's original request, (3) the summary, (4) the
 * todo items one for one, (5) the configured number of most recent turns, verbatim and in order. Part (1),
 * the system prompt and the tool definitions, is not in the conversation at all: it travels on every request
 * as `systemPrompt` and `tools`, so it survives character for character without being copied here.
 */
export function rebuild(original: ChatMessage, summary: string, todoLines: readonly string[], preserved: readonly ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [original, { role: 'user', content: [{ kind: 'text', text: `[Context compression] The earlier part of this conversation was replaced by this summary.\n\n${summary}` }] }];
  // REQ-MONITOR-084 (4): carried across ONE FOR ONE — never summarised, never cut to fit the summary's bound.
  if (todoLines.length > 0) out.push({ role: 'user', content: [{ kind: 'text', text: `[Task plan] The items on your plan, unchanged:\n${todoLines.map((t) => `- ${t}`).join('\n')}` }] });
  out.push(...preserved);
  return out;
}

export interface CompressionInput {
  readonly conversation: Conversation;
  readonly preserveRecentTurns: number;
  readonly charsPerToken: number;
  readonly todoLines: readonly string[];
}

/**
 * One compression: slice, ask the model, rebuild, install. The conversation is replaced only on success, so
 * a failed pass leaves the agent exactly where it was — which is what lets `REQ-ORCH-093` surface the
 * original rejection unchanged rather than a second, worse one.
 */
export async function compress(input: CompressionInput, deps: CompressorDeps, signal: AbortSignal): Promise<CompressionOutcome> {
  const { conversation } = input;
  const messages = conversation.snapshot();
  const before = estimateTokens(messages, input.charsPerToken);
  const original = conversation.originalRequest;
  const fail = (reason: string, nothingToDo = false): CompressionOutcome => ({ ok: false, reason, nothingToDo, beforeTokens: before, afterTokens: before, beforeMessages: messages.length, afterMessages: messages.length, summary: '' });
  if (original === null) return fail('the conversation carries no user request to preserve', true);
  const from = preservedFrom(messages, input.preserveRecentTurns);
  const start = messages.indexOf(original) + 1;
  const compressible = messages.slice(start, from);
  if (compressible.length === 0) return fail('nothing lies between the original request and the preserved turns', true);

  const timeout = deps.timeoutMs ?? COMPRESSION_TIMEOUT_MS;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort(); else signal.addEventListener('abort', onAbort, { once: true });
  const timer = deps.timers.after(timeout, () => controller.abort());
  let text = '';
  let failure = '';
  try {
    // REQ-MONITOR-082: the summary must state the work performed, the findings reached and the questions left open.
    const ask = `Condense the agent activity below into a summary the agent can work from. State, in this order: the work performed, the findings reached, and the questions left open. Be specific about files, commands and results; a fact you drop is lost to the agent for good.\n\nActivity:\n${compressorTranscript(compressible, deps.inputTokens !== undefined && deps.inputTokens > 0 ? deps.inputTokens * input.charsPerToken : undefined)}`;
    const r = await deps.backend.runTurn(
      { persona: 'compressor', systemPrompt: SYSTEM, messages: [{ role: 'user', content: [{ kind: 'text', text: ask }] }], tools: [], model: deps.model, thinking: deps.thinking, timeoutMs: timeout, retries: 0, resolveCredential: deps.credentialFor(deps.model) },
      { delta: () => undefined, reasoning: () => undefined, usage: () => undefined },
      controller.signal,
    );
    if (r.status === 'failed') failure = r.error.headline; else text = r.text.trim();
  } catch (cause) {
    failure = String(cause instanceof Error ? cause.message : cause);
  } finally {
    timer.cancel();
    signal.removeEventListener('abort', onAbort);
  }
  if (signal.aborted) return fail('the run was cancelled during the compressing pass');
  if (failure !== '') return fail(`the compressing pass failed: ${failure}`);
  if (controller.signal.aborted) return fail(`the compressing pass exceeded ${Number(timeout) / 1000} s`);
  if (text === '') return fail('the compressing pass produced no summary');

  const summary = clampSummary(text);
  const rebuilt = rebuild(original, summary, input.todoLines, messages.slice(from));
  if (!conversation.replace(rebuilt)) return fail('the agent\'s turn ended before the compressing pass completed');
  return { ok: true, reason: '', nothingToDo: false, beforeTokens: before, afterTokens: estimateTokens(rebuilt, input.charsPerToken), beforeMessages: messages.length, afterMessages: rebuilt.length, summary };
}

/** `REQ-CONFIG-134`/`REQ-CONFIG-135`: the resolved trigger for the agent's model, with the four inputs that produced it. */
export interface ResolvedTrigger {
  readonly tokens: number;
  readonly thresholdPercentage: number;
  readonly capacity: number;
  readonly advertisedInputLimit: number | null;
  readonly defaultThreshold: number;
}

/** What a turn is given so its agent can compress: the pass, the trigger, the section's two figures and the plan. */
export interface TurnCompression {
  readonly compressor: CompressorDeps;
  readonly trigger: ResolvedTrigger;
  /** `REQ-CONFIG-132`: `chars_per_token`, default 4. */
  readonly charsPerToken: number;
  /** `REQ-CONFIG-132`: `preserve_recent_turns`, default 4. */
  readonly preserveRecentTurns: number;
  /** `REQ-MONITOR-084` (4): the agent's todo items, carried across one for one. */
  readonly todoLines: () => readonly string[];
  /**
   * `REQ-MONITOR-085`: the agent whose context is being compressed, or null when none is. Part AO: the second argument
   * names the agent on BOTH edges, because a manual pass compresses several agents at once (REQ-MONITOR-092) and a bare
   * null could not say which one finished.
   */
  readonly onState?: ((agent: string | null, name: string) => void) | undefined;
  /**
   * `REQ-SESSION-139` (ADR-0008): one COMPLETED compression, for the run's own aggregate. It is raised on the
   * same line as `REQ-MONITOR-086`'s per-agent counter because they count the same event; keeping them apart
   * is what let the session figure stay at zero through three compressions of a real run.
   */
  readonly onCompressed?: (() => void) | undefined;
  // Part AO
  /**
   * ADR-0060 decision 1's registry (Part AO): the turn registers its conversation here for the span of the turn, so
   * `forceCompression` can reach every live conversation. Absent means the run offers no manual compression.
   */
  readonly registry?: ConversationRegistry | undefined;
}

export interface CompressionRecorder {
  readonly writer: SessionWriter;
  readonly clocks: Clocks;
  readonly warn: (m: string) => void;
  readonly agent: string;
}

/**
 * The two call sites' shared half: read the count `REQ-MONITOR-081` prefers, run the pass, and report it the
 * three ways `REQ-CONFIG-135` fixes — the timeline entry carrying the four inputs as SEPARATE machine-readable
 * fields, one transcript row rendered from those fields, and the log line. Which of the three venues is "the
 * session's event stream" is OQ-53 (ADR-0060 decision 7): the wire catalogue is closed at 23 kinds
 * (`REQ-EVENTS-041`) and none of them reports a compression, so the timeline carries it as Part Q's
 * `model_exhausted` and `model_override` are carried.
 */
export class CompressionRunner {
  private automatic = 0;
  /** The no-op above is logged once per agent, not once per step. */
  private noted = false;
  /** The counted prompt that triggered the last successful automatic compression. */
  private countedAtLastCompression: number | null = null;
  /**
   * Latched when compressing is proven not to help: the incompressible part of the prompt — the system prompt
   * and the tool definitions, which `REQ-MONITOR-082` keeps character for character — already exceeds the
   * threshold on its own, so no amount of compressing the conversation can bring the count under it.
   */
  private futile = false;
  // Part AO
  /**
   * Part AO — ONE pass per conversation at a time. The manual arm (REQ-MONITOR-092) runs concurrently across agents
   * and may land while this agent's automatic trigger is due, or the other way round; two passes over one
   * conversation would each slice the array they were given and the second `replace` would discard the first's
   * work. A pass in flight is therefore joined rather than duplicated, and `due()` answers false while one runs.
   */
  private inFlight: Promise<boolean> | null = null;
  private lastOutcome: CompressionOutcome | null = null;

  constructor(private readonly svc: TurnCompression, private readonly rec: CompressionRecorder) {}

  // Part AO
  /**
   * REQ-CHAT-081 / REQ-MONITOR-092/096: the manual pass — unconditional. It reads neither the trigger nor the latch:
   * `due()` is not consulted, `futile` is not read, and the entry it writes carries no threshold figure because none
   * was used (REQ-MONITOR-096's "never read threshold configuration" is honoured by not touching `svc.trigger` here).
   * The preserved-turn count and the characters-per-token ratio apply exactly as they do to the automatic pass
   * (REQ-MONITOR-092's second sentence) — they are the same `compress()` call. A pass already in flight for this
   * agent is joined (its outcome is this request's outcome), which is the single-flight rule above.
   */
  async manual(conversation: Conversation, condensed: boolean, signal: AbortSignal): Promise<ManualCompressionResult> {
    if (this.inFlight !== null) {
      const joined = await this.inFlight;
      const last = this.lastOutcome;
      if (joined) return { kind: 'compressed', beforeMessages: last?.beforeMessages ?? 0, afterMessages: last?.afterMessages ?? 0 };
      if (last?.nothingToDo) return { kind: 'unchanged', reason: last.reason };
      return { kind: 'failed', reason: last?.reason ?? 'a compression already in flight for this agent did not complete' };
    }
    const ok = await this.run(conversation, 'manual', condensed, signal);
    const last = this.lastOutcome;
    if (ok) return { kind: 'compressed', beforeMessages: last?.beforeMessages ?? 0, afterMessages: last?.afterMessages ?? 0 };
    if (last?.nothingToDo) return { kind: 'unchanged', reason: last.reason };
    return { kind: 'failed', reason: last?.reason ?? 'the compressing pass did not complete' };
  }

  /**
   * `REQ-MONITOR-076`/`REQ-MONITOR-081`: the count is the provider's real last-prompt reading when there is
   * one — the input count of this agent's latest model step, which the turn records after every step — and a
   * character estimate otherwise, including when the history has already been condensed and the reading
   * belongs to the pre-compression prompt.
   */
  count(conversation: Conversation, condensed: boolean): { tokens: number; source: 'provider' | 'estimate' } {
    const provider = this.rec.writer.activity.contextUsed(this.rec.agent);
    if (!condensed && provider > 0) return { tokens: provider, source: 'provider' };
    return { tokens: estimateTokens(conversation.snapshot(), this.svc.charsPerToken), source: 'estimate' };
  }

  /**
   * `REQ-MONITOR-076`: at or above the effective threshold, compression runs before the call.
   *
   * With one guard the requirement does not state and the code cannot do without. The count it names is the
   * WHOLE prompt, but a compression can only shorten the conversation: the system prompt and the tool
   * definitions survive character for character (`REQ-MONITOR-082`) and are not in the conversation at all,
   * and the reconstruction has a floor of its own (the original request, the summary, the plan, the preserved
   * turns). Where that incompressible remainder reaches the threshold by itself, every step is over it, every
   * step compresses, and nothing gets smaller.
   *
   * The rule: **a compression must lower the counted prompt.** If the next provider-sourced count is not below
   * the count that triggered the previous compression, compressing is not working and is latched off for this
   * agent, with the figures and what to change. It cannot be fooled by arithmetic about how small the
   * conversation might in principle become, which is where the first form of this guard went wrong — it
   * compared the count less the conversation against the threshold, found 8,708 against 9,000, concluded a
   * perfect compression could still get under, and compressed four more times. A compression is not perfect:
   * it keeps four things. Measuring the outcome is the only test that holds.
   *
   * `REQ-ORCH-093`'s recovery path is NOT latched — a rejection must always be answered with an attempt.
   */
  due(conversation: Conversation, condensed: boolean): boolean {
    // Part AO: a pass in flight (manual or automatic) is never doubled.
    if (this.inFlight !== null) return false;
    if (this.svc.trigger.tokens <= 0 || this.futile) return false;
    const counted = this.count(conversation, condensed);
    if (counted.tokens < this.svc.trigger.tokens) return false;
    // Only a provider figure can judge the previous compression: an estimate measures a different thing.
    if (this.countedAtLastCompression === null || counted.source !== 'provider') return true;
    if (counted.tokens < this.countedAtLastCompression) return true;
    this.futile = true;
    const conversationTokens = estimateTokens(conversation.snapshot(), this.svc.charsPerToken);
    this.rec.warn(
      `${this.rec.agent}: automatic context compression is switched off for this agent. The last compression left the counted prompt at ${counted.tokens} tokens against ${this.countedAtLastCompression} before it, still over the ${this.svc.trigger.tokens} trigger, while the conversation it can rewrite is only about ${conversationTokens} tokens — the rest is the system prompt and the tool definitions, which compression must keep character for character (REQ-MONITOR-082). Compressing again would cost a model call and shorten nothing. Raise compressor.threshold_percentage or compressor.default_threshold, or reduce the tool surface.`,
    );
    return false;
  }

  /** How many automatic compressions this turn has run — the figure the proof reads back. */
  get automaticCount(): number {
    return this.automatic;
  }

  async run(conversation: Conversation, kind: 'automatic' | 'rejection' | 'manual', condensed: boolean, signal: AbortSignal): Promise<boolean> {
    // Part AO: the single-flight guard wraps the whole pass; `manual()` joins a pass in flight instead of starting one.
    if (this.inFlight !== null) return this.inFlight;
    const pass = this.runOnce(conversation, kind, condensed, signal);
    this.inFlight = pass;
    try { return await pass; } finally { this.inFlight = null; }
  }

  private async runOnce(conversation: Conversation, kind: 'automatic' | 'rejection' | 'manual', condensed: boolean, signal: AbortSignal): Promise<boolean> {
    const { writer, clocks, agent } = this.rec;
    const counted = this.count(conversation, condensed);
    const startedMs = clocks.monotonic.now();
    this.svc.onState?.(agent, agent);
    let outcome;
    try {
      outcome = await compress({ conversation, preserveRecentTurns: this.svc.preserveRecentTurns, charsPerToken: this.svc.charsPerToken, todoLines: this.svc.todoLines() }, this.svc.compressor, signal);
    } finally {
      this.svc.onState?.(null, agent);
    }
    this.lastOutcome = outcome;
    const t = this.svc.trigger;
    if (!outcome.ok) {
      const message = `${agent}'s context was not compressed (${kind}): ${outcome.reason}`;
      /**
       * A no-op is not a failure. The automatic trigger is evaluated before EVERY step, so once the count is
       * over the threshold a conversation with nothing between the original request and the preserved turns
       * would record one warning issue per remaining step. It is logged once per agent instead, and the
       * rejection path still fails the call because REQ-ORCH-093 surfaces the original rejection either way.
       */
      if (outcome.nothingToDo) {
        if (!this.noted) { this.noted = true; this.rec.warn(`${message} (this is not a failure; it is not recorded again for this agent)`); }
        return false;
      }
      // REQ-ORCH-093: a condensation that fails changes nothing — the caller surfaces the ORIGINAL rejection.
      writer.recordIssue({ kind: 'compression_failed', severity: 'warning', actor: agent, message, metadata: { trigger: kind, reason: outcome.reason, counted_tokens: counted.tokens, count_source: counted.source } });
      this.rec.warn(message);
      return false;
    }
    if (kind === 'automatic') {
      this.automatic += 1;
      // What the NEXT provider-sourced count must beat for compressing to be judged worth repeating.
      if (counted.source === 'provider') this.countedAtLastCompression = counted.tokens;
    }
    const latencyMs = clocks.monotonic.now() - startedMs;
    // REQ-MONITOR-086: the completion is counted once, here, and the entry below is what a resume counts again from.
    writer.activity.compressed(agent);
    // REQ-SESSION-139 (ADR-0008): the session-wide aggregate is raised from the SAME completion, never recomputed.
    this.svc.onCompressed?.();
    /**
     * REQ-CONFIG-135: the four inputs and the resulting token number as separate fields, never a sentence to parse.
     * Part AO: a MANUAL pass consulted none of them (REQ-CHAT-081, REQ-MONITOR-096), so its entry carries none — an
     * entry naming a threshold that was never read would be a false record — and its reason says so instead.
     * The entry itself is kept: REQ-MONITOR-086 counts every completion and REQ-MONITOR-281 shows the count, and
     * "never read or mutate persisted session state" is read as the run's status and columns, not the record of
     * what the compression did.
     */
    const figures = {
      agent, trigger: kind, counted_tokens: counted.tokens, count_source: counted.source,
      before_tokens: outcome.beforeTokens, after_tokens: outcome.afterTokens, before_messages: outcome.beforeMessages, after_messages: outcome.afterMessages, latency_ms: Math.round(latencyMs),
    };
    const metadata = kind === 'manual' ? figures : { ...figures, threshold_percentage: t.thresholdPercentage, capacity: t.capacity, advertised_input_limit: t.advertisedInputLimit, default_threshold: t.defaultThreshold, trigger_tokens: t.tokens };
    const reason = kind === 'manual' ? MANUAL_COMPRESSION_REASON : compressionReason(t, counted.tokens, counted.source);
    writer.appendTimeline('context_compressed', 'rotaris', `${agent}'s context was compressed (${kind}): ${outcome.beforeMessages} → ${outcome.afterMessages} messages, ${outcome.beforeTokens} → ${outcome.afterTokens} estimated tokens. ${reason}`, metadata);
    // REQ-CONFIG-135's second venue: the transcript entry's reason line, RENDERED FROM THOSE FIELDS.
    writer.appendRow('system', `Context compressed for ${agent} — ${reason}`, true);
    this.rec.warn(`context compressed for ${agent} (${kind}): ${outcome.beforeMessages} → ${outcome.afterMessages} messages, ${outcome.beforeTokens} → ${outcome.afterTokens} estimated tokens in ${Math.round(latencyMs)} ms; ${reason}`);
    return true;
  }
}

// Part AO
/** REQ-CHAT-081: the reason a manual pass records — the threshold was not consulted, so no figure of it is quoted. */
export const MANUAL_COMPRESSION_REASON = 'Requested by the user; the automatic-compression threshold was not consulted (REQ-CHAT-081).';

/** `REQ-CONFIG-135`: the reason the user is given, rendered from the same fields the entry carries. */
export function compressionReason(t: ResolvedTrigger, countedTokens: number, source: 'provider' | 'estimate'): string {
  const advertised = t.advertisedInputLimit === null ? 'the model advertises no input limit' : `the model advertises ${t.advertisedInputLimit.toLocaleString('en-US')}`;
  return `${t.thresholdPercentage} % of a capacity of ${t.capacity.toLocaleString('en-US')} is ${t.tokens.toLocaleString('en-US')} tokens (${advertised}; the configured default capacity is ${t.defaultThreshold.toLocaleString('en-US')}), and the ${source === 'provider' ? "provider's last prompt count" : 'estimate from character length'} was ${countedTokens.toLocaleString('en-US')}.`;
}
