import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { millis, ok, type Clocks, type Ok } from '@rotaris/kernel';
import { type ChatMessage, type ModelClient, type ModelRequest, type StreamPart } from '@rotaris/model';

/**
 * One call as the scripted client received it: the model it was addressed to, the agent it answered as, and the
 * system text — the role's instructions with the session's context units after them (REQ-WORKSPACE-060).
 */
export interface ScriptedCallRecord {
  readonly call: number;
  readonly who: string;
  readonly model: string;
  readonly system: string;
}

/**
 * THE SCRIPTED MODEL CLIENT — verification only, and the reason every proof script in this repository runs
 * without a provider, a key or a network.
 *
 * It answers the shape a real client answers (`ModelClient`) from a STEP LIST read out of the environment:
 * `ROTARIS_SCRIPT` names the orchestrator's steps, comma-separated, one per model call, and
 * `ROTARIS_CHILD_SCRIPT` every child's. `glob`, `read`, `write`, `rm`, `git`, `push`, `edit` request a tool
 * call; `fetch:<url>` a fetch of that URL; `wait:<ms>` holds the call that long ON THE CLOCK PORT and then
 * answers (the Overview proof needs a run longer than one token-sample period); anything else, or the end of
 * the list, answers with a short streamed reply, one delta per 120 ms so the growth tick is visible.
 *
 * Each agent keeps its own place in its list: the orchestrator, and each child by its TASK line. A resumed agent
 * (PD-ORCH-005's continue, in this process or after a relaunch) carries on with the step after the ones it had taken
 * (`resumedAt`, `takenFrom`), so a proof scripts "the resumed agent takes its next step" in one list. Each step marks its
 * place in the message it answers with — its tool call's id, or ` (scripted step <n>)` at the end of a streamed answer —
 * so a record that no longer holds every step (a later iteration's root, a compressed conversation) still says where the
 * agent stood. A call that ends with no message leaves no mark, so where the record is silent the client reads its
 * `ledger` — where each agent stood when its last call began, kept by the client before it (`StandingLedger`).
 *
 * Nothing here decides anything about a run: the loop, the permission gate and the store see exactly what they
 * would see from a model that chose the same steps, which is what keeps a proof's assertion about the product
 * rather than about the double.
 *
 * It was two hundred and fifty-seven lines in the middle of the run host's composition root, read past by
 * everyone editing the dispatch and edited by almost no one. Its interface is four dependencies: the clocks it
 * waits on, the line it writes for a proof to read back, and — optionally — `record`, which is handed every call
 * as it was received, and `ledger`, where it keeps each agent's place for the next client (absent: no ledger, and a
 * resumed agent is placed from its record alone, as before).
 *
 * `record` is the injection proof's reading of what the model port RECEIVED — the model-call capture seam `host.ts`
 * wires, compiled out of a packaged build (the variable is not named here because this comment ships in the bundle).
 * It sits in the scripted client and nowhere else, so it can only ever see a call no provider was going to answer:
 * there is no path by which it records traffic bound for a real endpoint.
 */
/** A step that answers with no assistant message, so an agent's record never shows it: a failure, a hang, a wait prefix. */
const LEAVES_NO_MESSAGE = /^(fail(:.*)?|hang|wait:\d+)$/;

/**
 * PD-ORCH-005 (the repair of the-scripted-client-restarts-its-script-for-every-run.md): the index in `script` of the step
 * an agent takes next when its request already carries `taken` steps of its own record. A continue — in the same process
 * or after a relaunch — builds a new client, and the resumed agent's first request carries its record, so the double
 * reads where the agent stood from the record rather than from a counter the old client took with it.
 *
 * One assistant message stands for each step that answered (`turn.ts` pushes exactly one per step); a step that answers
 * with none is counted as consumed wherever it falls before the last step the record shows. A fresh agent carries no
 * assistant message, so it starts from the first step exactly as before. How many such steps the agent has taken is read
 * by `takenFrom`, from the ordinal each step leaves in the record, not from how many messages the record still holds.
 */
function resumedAt(script: readonly string[], taken: number): number {
  let index = 0;
  for (let shown = 0; shown < taken && index < script.length; index += 1) {
    if (!LEAVES_NO_MESSAGE.test(script[index]!)) shown += 1;
  }
  return index;
}

/** `resumedAt`'s inverse: how many steps up to and including `index` answered with a message — the step's ordinal. */
function ordinalAt(script: readonly string[], index: number): number {
  let shown = 0;
  for (let i = 0; i <= index && i < script.length; i += 1) if (!LEAVES_NO_MESSAGE.test(script[i]!)) shown += 1;
  return shown + Math.max(0, index + 1 - script.length);
}

/*
 * The repair of fixed/the-scripted-client-counts-only-the-steps-a-resumed-record-still-shows.md. Counting a resumed record's
 * messages placed an agent too early wherever the record does not hold every step it took: a root resumed in a later
 * iteration of its run holds only that iteration's steps, where an unbroken client's counter counted every iteration's,
 * and a record the compressing pass rewrote holds only the steps it kept. So each step now leaves its ordinal — how many
 * steps that answered with a message this agent had taken, this one included, across every iteration — in the message
 * it answers with: in the tool call's id where it calls a tool (`call-<n>-s<ordinal>`, which no surface prints), and at
 * the end of its text where it only answers. The scripted compressor restates every agent's ordinal in its summary,
 * which the rebuilt conversation carries, so a record whose tagged steps were all condensed away still says where the
 * agent stood. Nothing here reaches the product's own record other than as a model's words and call ids would.
 */
const ORDINAL_IN_CALL_ID = /-s(\d+)$/;
const ORDINAL_IN_TEXT = /\(scripted step (\d+)\)/g;
const RESTATED = /^Scripted steps taken: (\{.*\})$/m;
const COMPRESSION_SUMMARY = '[Context compression]';

/** The ordinal a scripted step left in this assistant message, or `null` for a message that carries none. */
function ordinalOf(message: ChatMessage): number | null {
  let found: number | null = null;
  for (const part of message.content) {
    if (part.kind === 'tool-call') { const m = ORDINAL_IN_CALL_ID.exec(part.callId); if (m) found = Number(m[1]); }
    // The last mark in the text is the step's own: an answer can quote a tool's result, which could carry another's.
    if (part.kind === 'text') for (const m of part.text.matchAll(ORDINAL_IN_TEXT)) found = Number(m[1]);
  }
  return found;
}

/**
 * How many steps that answered with a message the agent `key` had taken when its request was built: the last ordinal
 * its record carries — in an assistant message, or restated by a compression summary — plus one for each assistant
 * message after it that carries none. A record no step marked (one an earlier build wrote) counts its messages, as
 * before.
 */
function takenFrom(messages: readonly ChatMessage[], key: string): number {
  let taken = 0;
  for (const message of messages) {
    if (message.role === 'assistant') { taken = ordinalOf(message) ?? taken + 1; continue; }
    if (message.role !== 'user') continue;
    const first = message.content[0];
    if (first?.kind !== 'text' || !first.text.startsWith(COMPRESSION_SUMMARY)) continue;
    const restated = RESTATED.exec(first.text)?.[1];
    if (restated === undefined) continue;
    try {
      const value = (JSON.parse(restated) as Record<string, unknown>)[key];
      if (typeof value === 'number') taken = value;
    } catch { /* a summary this client did not write */ }
  }
  return taken;
}

/*
 * The repair of fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md. A call that
 * ends with no message — a failure, a hang, a wait the quit cut, an answer cut mid-stream — leaves nothing in the record,
 * and the product sends a resumed agent its record and nothing else. So a root resumed in a later iteration before its
 * first reply there, whose record holds only the iteration's task, was placed as a fresh agent; and an agent whose last
 * step before a cross-client resume answered with no message took that step again. An unbroken client would have
 * carried on from its counter in both.
 *
 * No mark the double writes can reach such a record, so the client keeps the counter where the next client can read it:
 * when an agent's call begins, its entry records the script position its next call takes (every step it has taken, a
 * message-less step and a wait prefix included) over a digest of the conversation the call was handed; when the call
 * answers, the entry is cleared, since the record now carries the step's own mark. The next client reads an entry only
 * at an agent's first call, and only when the conversation it is handed begins with the one the entry was written over
 * — a resumed record, perhaps with a continue's message after it. A fresh agent whose prompt matches an entry left by a
 * call that never answered is the one reading this cannot tell from a resumed one; it is stated, not guarded.
 */

/** Where an agent stood when its last call began, kept until that call answers. */
export interface ScriptedStanding {
  /** The script position its next call takes: every step it has taken, a message-less step and a wait prefix included. */
  readonly next: number;
  /** How many conversation messages (the system text not counted) the call was handed, and their digest. */
  readonly length: number;
  readonly digest: string;
}

/**
 * The scripted client's place-keeping between clients: one entry per agent — its counter key (the orchestrator, a child by
 * its TASK line) and the digest of the message its conversation opens with.
 */
export interface StandingLedger {
  read(key: string): ScriptedStanding | undefined;
  /** `null` clears the key's entry. */
  write(key: string, standing: ScriptedStanding | null): void;
}

/** A ledger held in memory — shared between the clients of one process, gone with it. */
export function memoryLedger(): StandingLedger {
  const entries = new Map<string, ScriptedStanding>();
  return { read: (key) => entries.get(key), write: (key, standing) => { if (standing === null) entries.delete(key); else entries.set(key, standing); } };
}

/**
 * A ledger kept in one JSON file, read and written whole at every access, so a relaunch reads what the last process left.
 * A file that is missing or does not parse reads as empty; a write that fails is logged and the client goes on as if it
 * had no ledger for that call.
 */
export function fileLedger(path: string, log: (message: string) => void): StandingLedger {
  const load = (): Record<string, ScriptedStanding> => {
    try { const value: unknown = JSON.parse(readFileSync(path, 'utf8')); return value !== null && typeof value === 'object' ? value as Record<string, ScriptedStanding> : {}; } catch { return {}; }
  };
  return {
    read: (key) => { const entry = load()[key]; return entry !== undefined && typeof entry.next === 'number' && typeof entry.length === 'number' && typeof entry.digest === 'string' ? entry : undefined; },
    write: (key, standing) => {
      const entries = load();
      if (standing === null) { if (!(key in entries)) return; delete entries[key]; } else entries[key] = standing;
      try { writeFileSync(path, `${JSON.stringify(entries)}\n`); } catch (cause) { log(`scripted: the standing ledger could not be written (${String(cause)})`); }
    },
  };
}

/**
 * The digest a ledger entry is written over: each message's role and, per part, its text, its tool call's id or its tool
 * result's — what the record keeps of a message whatever a request's assembly does to the rest of it.
 */
function digestOf(messages: readonly ChatMessage[]): string {
  const hash = createHash('sha256');
  for (const message of messages) {
    hash.update(`\u0000${message.role}`);
    for (const part of message.content) {
      hash.update(`\u0001${part.kind}:`);
      if (part.kind === 'text') hash.update(part.text);
      else if (part.kind === 'tool-call' || part.kind === 'tool-result') hash.update(part.callId);
    }
  }
  return hash.digest('hex');
}

/** The conversation a request carries: its messages after the system text. */
function conversationOf(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  return messages[0]?.role === 'system' ? messages.slice(1) : messages;
}

export function scriptedClient(c: Clocks, log: (message: string) => void, record?: (call: ScriptedCallRecord) => void, ledger?: StandingLedger): ModelClient {
  const parse = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  // ROTARIS_SCRIPT drives the orchestrator; ROTARIS_CHILD_SCRIPT every child (a `delegate:<persona>:<name>` step delegates).
  const loopScript = /^loop:([^:]+):(\d+)$/.exec(process.env['ROTARIS_SCRIPT'] ?? '');
  const scripts: Record<string, string[]> = { orchestrator: loopScript ? Array.from({ length: Number(loopScript[2]) }, () => loopScript[1]!) : parse(process.env['ROTARIS_SCRIPT']), child: parse(process.env['ROTARIS_CHILD_SCRIPT']) };
  const calls: Record<string, number> = { orchestrator: 0, child: 0, summariser: 0, compressor: 0, 'loop-classifier': 0 };
  // PD-ORCH-005: the keys whose counter has been placed by the record their first call in this client carried.
  const seeded = new Set<string>();
  // `calls` is each key's position in its script as the environment names it — the ledger's unit too. The lists are never
  // changed after this: every child shares `scripts.child`, so a completed wait moves only the child's own counter past it
  // (the repair of fixed/the-scripted-clients-wait-prefix-is-spliced-out-of-the-list-every-child-shares.md).
  let call = 0;
  const TOOL_STEPS: Record<string, { name: string; args: Record<string, unknown> }> = {
    glob: { name: 'glob', args: { pattern: '**/*.md' } },
    read: { name: 'read_file', args: { path: 'README.md' } },
    // Part P: the checkpoint proof edits NOTES.md in a later launch, and the edit tool wants the file read in this process first.
    readnotes: { name: 'read_file', args: { path: 'NOTES.md' } },
    write: { name: 'write_file', args: { operation: 'create', path: 'NOTES.md', content: '# Notes\n\nWritten by the scripted agent through the gate.\n' } },
    edit: { name: 'write_file', args: { operation: 'edit', path: 'NOTES.md', old_string: 'scripted agent', new_string: 'scripted agent (edited)' } },
    rm: { name: 'terminal', args: { command: 'rm -rf build' } },
    git: { name: 'terminal', args: { command: 'git status' } },
    push: { name: 'terminal', args: { command: 'git push origin main' } },
    todo: { name: 'todo', args: { operation: 'add_phase', name: 'main' } },
  };
  return {
    async *stream(req: ModelRequest) {
      await req.resolveCredential();
      const system = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
      const who = /^You are the orchestrator/.test(system) ? 'orchestrator' : /summarise a finished agent transcript/i.test(system) ? 'summariser' : /^You condense an agent conversation/.test(system) ? 'compressor' : /^You classify a user request/.test(system) ? 'classifier' : /^You classify an agent conversation/.test(system) ? 'loop-classifier' : 'child';
      call += 1;
      // Part S: every child instance follows the child script from its own first call (keyed by its TASK line), so a fan-out of
      // three children each takes the same steps; a single child reads exactly as before.
      const firstUser = req.messages.find((m) => m.role === 'user')?.content.find((p) => p.kind === 'text');
      const taskName = who === 'child' && firstUser && firstUser.kind === 'text' ? /TASK: ([^\n]+)/.exec(firstUser.text)?.[1] ?? '' : '';
      const counterKey = who === 'child' ? `child:${taskName}` : who;
      const agent = who === 'orchestrator' || who === 'child';
      const conversation = conversationOf(req.messages);
      // One entry per agent and opening message, so two sessions' roots in one process do not overwrite each other's.
      const entryKey = `${counterKey} ${digestOf(conversation.slice(0, 1))}`;
      if (!seeded.has(counterKey)) {
        seeded.add(counterKey);
        const fromRecord = resumedAt(scripts[who] ?? [], takenFrom(req.messages, counterKey));
        // Where the record is silent — no step since the last mark answered — the entry the client before this one left.
        const left = agent ? ledger?.read(entryKey) : undefined;
        const fromLedger = left !== undefined && left.length <= conversation.length && digestOf(conversation.slice(0, left.length)) === left.digest ? left.next : 0;
        calls[counterKey] = Math.max(fromRecord, fromLedger);
      }
      calls[counterKey] = (calls[counterKey] ?? 0) + 1;
      // Verification only: the model each call went to, so a proof can read a fallback or an override from the log (Part Q).
      log(`scripted model call: ${req.model.providerId}/${req.model.modelId} (${who})`);
      record?.({ call, who, model: `${req.model.providerId}/${req.model.modelId}`, system });
      if (who === 'classifier') {
        // ROTARIS_INTENT_SCRIPT: <category> | garbage | timeout | reject (the two JSON rungs refused, then text) — verification only.
        const want = (process.env['ROTARIS_INTENT_SCRIPT'] ?? 'moderate_feature').trim();
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        if (want === 'reject' && req.output !== undefined) { yield { ok: false as const, error: { code: 'http' as const, headline: 'response_format is not supported by this model', status: 400, transient: false } }; return; }
        const text = want === 'garbage' ? 'lol no' : want === 'reject' ? 'small_feature\nfrom the text rung' : req.output === undefined ? `${want}\nscripted` : JSON.stringify({ intent: want, confidence: 0.75, reason: 'scripted classification' });
        yield ok<StreamPart>({ kind: 'text', delta: text });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 12, output: 8 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'loop-classifier') {
        const want = (process.env['ROTARIS_LOOP_SCRIPT'] ?? 'detected').trim();
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        const loop_detected = want !== 'clear';
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify({ loop_detected, reason: loop_detected ? 'scripted repeated work' : 'scripted progress', corrective_message: 'Pause and reassess the current path. Choose a different concrete approach and verify its viability first.' }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 12, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'compressor') {
        // ROTARIS_COMPRESSOR_SCRIPT=fail — the compressing pass itself failing, so REQ-ORCH-093's "the original
        // rejection is surfaced unchanged" has a producer. Verification only.
        // Part AO: `fail-if:<text>` fails only the pass whose compressible slice mentions the text — one agent of a
        // concurrent manual pass, so REQ-MONITOR-094's per-agent listing has a producer while the others succeed.
        const compressorScript = (process.env['ROTARIS_COMPRESSOR_SCRIPT'] ?? '').trim();
        const failIf = /^fail-if:(.+)$/.exec(compressorScript);
        const slice = req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
        if (compressorScript === 'fail' || (failIf !== null && slice.includes(failIf[1]!))) {
          yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted compressor failure (HTTP 500)', status: 500, transient: false } };
          return;
        }
        // Part AH: the compressing pass's scripted answer. It states the three things REQ-MONITOR-082 asks for,
        // so the proof can assert the summary reached the rebuilt conversation rather than a placeholder.
        // The last line restates where every agent this client serves stood (`takenFrom` reads it back after a resume).
        const standing = Object.fromEntries(Object.entries(calls).filter(([key, n]) => (key === 'orchestrator' || key.startsWith('child:')) && n > 0).map(([key, n]) => [key, ordinalAt(scripts[key === 'orchestrator' ? 'orchestrator' : 'child'] ?? [], n - 1)]));
        yield ok<StreamPart>({ kind: 'text', delta: ['Work performed: the scripted agent read the repository and wrote NOTES.md.', 'Findings reached: the transcript renderer draws one row per event.', 'Questions left open: none.', `Scripted steps taken: ${JSON.stringify(standing)}`].join(String.fromCharCode(10)) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 40, output: 24 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'summariser') {
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify({ summary: 'The child carried out its task (scripted summary).', key_findings: ['scripted'], tags: ['implementation'] }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 20, output: 10 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      /**
       * PD-LIBRARY-002 (ADR-0065): the improvement analyst, BOTH passes, recognised by its own system text
       * rather than by a role, because `analystSystem` is the only thing that tells them apart on the wire.
       *
       * `ROTARIS_IMPROVEMENT_SCRIPT` is what a proof drives it with — `propose` (anything else, once set),
       * `empty`, `timeout` (never answers, so the analyst's own wall-clock bound is what ends the pass) and
       * `wait:<ms>[:<step>]` (the pass held open long enough for a surface to be read WHILE it runs). Unset
       * means this branch does not exist: every proof written before it sees the answer it always saw.
       *
       * A proposal's evidence cites a session id taken out of the request's own `considered_session_ids`,
       * and the second proposal cites one that is not there — so the attribution the analyst enforces has
       * both a case it must keep and a case it must refuse, measured in the built product.
       */
      const analystScript = (process.env['ROTARIS_IMPROVEMENT_SCRIPT'] ?? '').trim();
      if (analystScript !== '' && /improvement analyst for a software workspace/.test(system)) {
        log(`scripted improvement analyst: ${analystScript}`);
        let want = analystScript;
        const held = /^wait:(\d+)(?::(.+))?$/.exec(want);
        if (held) {
          await new Promise<void>((resolve) => { const t = c.timers.after(millis(Number(held[1])), resolve); req.signal.addEventListener('abort', () => { t.cancel(); resolve(); }, { once: true }); });
          if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
          want = held[2] ?? 'propose';
        }
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        const prompt = req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
        let considered: string[] = [];
        try { considered = JSON.parse(/"considered_session_ids":(\[[^\]]*\])/.exec(prompt)?.[1] ?? '[]') as string[]; } catch { considered = []; }
        const cited = considered[0] ?? null;
        const answer = want === 'empty' ? { proposals: [] } : {
          proposals: [
            { category: 'agents_md_update', summary: 'Name the build gate in AGENTS.md', recommended_action: 'Add one line to AGENTS.md naming the gate every run must pass.', risk: 'low', evidence: [{ kind: 'session', text: 'recent sessions ended without naming a gate', source_session_id: cited }] },
            { category: 'documentation_update', summary: 'Record how this workspace is set up', recommended_action: 'Add a paragraph to README.md.', risk: 'low', evidence: [{ kind: 'session', text: 'cited from a session this pass never read', source_session_id: 'session-never-read' }] },
          ],
        };
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify(answer) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 64, output: 48 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      // The agent's entry, written as its call begins and cleared when it answers (`StandingLedger`).
      const stand = (): void => { if (agent) ledger?.write(entryKey, { next: calls[counterKey] ?? 0, length: conversation.length, digest: digestOf(conversation) }); };
      const finished = (reason: 'stop' | 'other'): Ok<StreamPart> => { if (agent) ledger?.write(entryKey, null); return ok<StreamPart>({ kind: 'finish', reason }); };
      stand();
      let step = scripts[who]?.[(calls[counterKey] ?? 1) - 1] ?? 'answer';
      const wait = /^wait:(\d+)$/.exec(step);
      if (wait) {
        // The wait is a prefix on this call, not a call of its own: the step after it answers in the same call.
        await new Promise<void>((resolve) => { const t = c.timers.after(millis(Number(wait[1])), resolve); req.signal.addEventListener('abort', () => { t.cancel(); resolve(); }, { once: true }); });
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        // The wait was a step of the script: the one after it is this call's too. Only this agent's counter moves past it.
        calls[counterKey] = (calls[counterKey] ?? 0) + 1;
        step = scripts[who]?.[(calls[counterKey] ?? 1) - 1] ?? 'answer';
        stand();
      }
      // The step's ordinal among this agent's steps that answer with a message, left in the message it answers with.
      const ordinal = ordinalAt(scripts[who] ?? [], (calls[counterKey] ?? 1) - 1);
      const callId = `call-${call}-s${ordinal}`;
      const marked = (text: string) => `${text} (scripted step ${ordinal})`;
      // `<fault>:only=<provider>`: the fault answers a call addressed to that provider alone, and a call to any other answers
      // as `answer` does — a credential refused by one provider, which a model on another provider does not share (the 401
      // note's fallback restart, REQ-NOTIFY-070, whose restarted root takes the script from its first step again).
      const scoped = /^(fail:(?:429|quota|503|401)(?::retry-after=\d+)?):only=([\w-]+)$/.exec(step);
      if (scoped) step = req.model.providerId === scoped[2] ? scoped[1]! : 'answer';
      if (step === 'fail') {
        yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted failure (HTTP 400)', status: 400, transient: false } };
        return;
      }
      if (step === 'fail:context') {
        // Part AH (REQ-ORCH-093): the context-window rejection, in one of the eight phrasings `classifyFailure` knows.
        yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted rejection: prompt is too long', status: 400, providerMessage: 'The maximum context length of this model is 8192 tokens; reduce the length of the messages.', transient: false } };
        return;
      }
      // Part Q's fault steps (REQ-ORCH-088/090/091/092): `fail:429[:retry-after=<s>]`, `fail:quota`, `fail:503`, `fail:401`,
      // each optionally `:only=<provider>` (above);
      // tokens:<n> — Part AH: a step that REPORTS n prompt tokens and then calls a tool so the turn goes round
      // again. REQ-MONITOR-081 prefers the provider's own figure, so this is how a scripted run crosses the
      // automatic threshold without composing a genuinely enormous conversation. Verification only.
      const tokenStep = /^tokens:(\d+)$/.exec(step);
      if (tokenStep) {
        yield ok<StreamPart>({ kind: 'text', delta: 'Working, with a large reported prompt. ' });
        if ((req.tools ?? []).some((t) => t.name === 'glob')) yield ok<StreamPart>({ kind: 'tool-call', callId, name: 'glob', argsDelta: JSON.stringify({ pattern: '**/*.md' }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: Number(tokenStep[1]), output: 12 } });
        yield finished('other');
        return;
      }
      // `hang` streams nothing until the caller aborts (the unresponsive-model timer or the child timeout).
      const fault = /^fail:(429|quota|503|401)(?::retry-after=(\d+))?$/.exec(step);
      if (fault) {
        const retry = fault[2] === undefined ? {} : { retryAfterMs: Number(fault[2]) * 1000, retryAfter: fault[2] };
        const error = fault[1] === '429' ? { code: 'http' as const, status: 429, headline: 'scripted rate limit (HTTP 429)', providerMessage: 'Too Many Requests', transient: false, ...retry }
          : fault[1] === 'quota' ? { code: 'http' as const, status: 429, headline: 'scripted quota exhaustion (HTTP 429)', providerMessage: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota, please check your plan and billing details."}}', transient: false }
            : fault[1] === '503' ? { code: 'http' as const, status: 503, headline: 'scripted service unavailable (HTTP 503)', providerMessage: 'Service Unavailable', transient: true }
              : { code: 'http' as const, status: 401, headline: 'scripted authentication failure (HTTP 401)', providerMessage: 'Incorrect API key provided', transient: false };
        yield { ok: false as const, error };
        return;
      }
      // Part Z (REQ-CHAT-163/062): `think` streams deliberation on the reasoning channel before the answer, so the
      // streamed-reasoning ROW has a producer in a scripted run. The three provider SHAPES that carry deliberation
      // are normalised inside the AI SDK client and are proven there; this proves what the engine does with one.
      if (step === 'think') {
        yield ok<StreamPart>({ kind: 'reasoning', delta: 'Weighing the request. ' });
        yield ok<StreamPart>({ kind: 'reasoning', delta: 'Two options remain, and the second is cheaper.' });
        yield ok<StreamPart>({ kind: 'text', delta: marked('The scripted answer, after deliberating.') });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 18, output: 9 } });
        yield finished('stop');
        return;
      }
      if (step === 'hang') {
        await new Promise<void>((resolve) => { if (req.signal.aborted) resolve(); else req.signal.addEventListener('abort', () => resolve(), { once: true }); });
        yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } };
        return;
      }
      // delegate:<persona>:<name>[:after] — `after` depends on the last task id a tool result reported.
      const delegate = /^delegate:([a-z-]+):([^:]+)(:after)?$/.exec(step);
      if (delegate && (req.tools ?? []).some((t) => t.name === 'delegate')) {
        const lastId = delegate[3] ? [...req.messages].reverse().flatMap((m) => [...m.content] as { kind: string; result?: string }[]).map((p) => (p.kind === 'tool-result' && p.result ? /task_id: (bg_[0-9a-f]{8})/.exec(p.result)?.[1] : undefined)).find((x) => x !== undefined) : undefined;
        yield ok<StreamPart>({ kind: 'text', delta: `Delegating to ${delegate[1]}. ` });
        yield ok<StreamPart>({ kind: 'tool-call', callId, name: 'delegate', argsDelta: JSON.stringify({ persona: delegate[1], task_name: delegate[2], task: `TASK: ${delegate[2]}\nEXPECTED OUTCOME: done\nMUST DO: use your tools\nMUST NOT DO: nothing else\nCONTEXT: scripted`, ...(lastId ? { depends_on: [lastId] } : {}) }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
        yield finished('other');
        return;
      }
      // artifact:<tool>[:<key>] — Part Y's proof: one of the three artifact tools, with arguments taken from
      // ROTARIS_SCRIPT_ARTIFACT_ARGS by key (a JSON map) or the defaults below. Verification only.
      const artifactStep = /^artifact:(artifact_write|artifact_read|artifact_list)(?::([\w-]+))?$/.exec(step);
      if (artifactStep) {
        const toolName = artifactStep[1]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_ARTIFACT_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = artifactStep[2] ?? toolName;
          const fallback = toolName === 'artifact_write'
            ? { slug: 'scripted-plan', title: 'The scripted plan', body: 'The first line of the scripted body.\n\nA second paragraph with `code` and **bold**.', tags: ['research'] }
            : toolName === 'artifact_read' ? { id_or_slug: 'scripted-plan' } : {};
          const args = key in scripted ? scripted[key] : fallback;
          yield ok<StreamPart>({ kind: 'text', delta: `Calling ${toolName}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId, name: toolName, argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield finished('other');
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // terminal:<key> — PD-LIBRARY-001's proof: one `terminal` call, with the arguments taken from
      // ROTARIS_SCRIPT_TERMINAL_ARGS by key (a JSON map) or the `git status` default below. Verification only,
      // in the shape of the artifact and MCP argument maps above: the proof needs a child that runs ordered
      // terminal commands whose exit statuses the command ledger can record, and the scripted dialect had no
      // deterministic terminal step.
      const terminalStep = /^terminal:([\w-]+)$/.exec(step);
      if (terminalStep) {
        if ((req.tools ?? []).some((t) => t.name === 'terminal')) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_TERMINAL_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = terminalStep[1]!;
          const args = key in scripted ? scripted[key] : { command: 'git status' };
          yield ok<StreamPart>({ kind: 'text', delta: `Running the terminal command for ${key}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId, name: 'terminal', argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield finished('other');
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // ask[:<key>] — Part AC's step: one `ask_questions` call, with the steps taken from ROTARIS_SCRIPT_QUESTIONS by
      // key (a JSON map) or the two-step default below. Verification only.
      const askStep = /^ask(?::([\w-]+))?$/.exec(step);
      if (askStep) {
        if ((req.tools ?? []).some((t) => t.name === 'ask_questions')) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_QUESTIONS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = askStep[1] ?? 'ask';
          const fallback = {
            steps: [
              { id: 'scope', title: 'Which scope should this change cover?', description: 'Pick the narrowest that still solves the problem.', options: [{ label: 'This file only' }, { label: 'The whole package', description: 'Slower, but consistent.' }] },
              { id: 'notes', title: 'Anything else the agent should know?', options: [], allow_freeform: true },
            ],
          };
          const args = key in scripted ? scripted[key] : fallback;
          yield ok<StreamPart>({ kind: 'text', delta: 'Asking the user. ' });
          yield ok<StreamPart>({ kind: 'tool-call', callId, name: 'ask_questions', argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield finished('other');
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // mcp:<server>.<tool> — the MCP proof's step: the callable name after `.` (a renamed tool by its replacement name); fixed arguments per tool.
      const mcpStep = /^mcp:([^.]+)\.(.+)$/.exec(step);
      if (mcpStep) {
        const toolName = mcpStep[2]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          // ROTARIS_SCRIPT_MCP_ARGS: a JSON map from callable name to the arguments the scripted agent sends (Part T's proof; verification only).
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_MCP_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const args = toolName in scripted ? scripted[toolName] : toolName === 'echo' ? { text: 'hello from the scripted agent' } : toolName === 'slow' ? { ms: 4_000 } : {};
          yield ok<StreamPart>({ kind: 'text', delta: `Calling ${toolName} on ${mcpStep[1]}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId, name: toolName, argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield finished('other');
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // fetch:<url> — everything after the first `fetch:` is the URL (the fetch proof's step).
      const tool = step.startsWith('fetch:') ? { name: 'fetch', args: { url: step.slice('fetch:'.length) } } : TOOL_STEPS[step];
      if (tool && (req.tools ?? []).some((t) => t.name === tool.name)) {
        yield ok<StreamPart>({ kind: 'text', delta: `Calling ${tool.name}. ` });
        yield ok<StreamPart>({ kind: 'tool-call', callId, name: tool.name, argsDelta: JSON.stringify(tool.args) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
        yield finished('other');
        return;
      }
      const last = req.messages.filter((m) => m.role === 'tool').at(-1)?.content[0];
      const seen = last && last.kind === 'tool-result' ? ` The last tool said: "${last.result.slice(0, 60).replace(/\s+/g, ' ')}".` : '';
      const first = req.messages.find((m) => m.role === 'user')?.content.find((p) => p.kind === 'text');
      const task = first && first.kind === 'text' ? first.text : '';
      const words = `I read your request — "${task.slice(0, 60)}" — and this is the scripted reply from the run loop.${seen}`.split(' ');
      // The mark rides on the last word, so the reply streams in exactly as many deltas as before.
      words[words.length - 1] = marked(words[words.length - 1]!);
      for (const w of words) {
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        await new Promise<void>((resolve) => c.timers.after(millis(120), resolve));
        yield ok<StreamPart>({ kind: 'text', delta: `${w} ` });
      }
      yield ok<StreamPart>({ kind: 'usage', usage: { input: 24, output: words.length } });
      yield finished('stop');
    },
  };
}
