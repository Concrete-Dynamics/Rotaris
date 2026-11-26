import { z } from 'zod';
import { runWorkflowScript, type WorkflowCall, type WorkflowOutcome } from '../workflow/isolate.js';
import { journaledHost, WorkflowInterrupted, type CallLink, type JournalEntry, type JournalSink, type LinkedWorkflowHost } from '../workflow/journal.js';
import type { DelegationPort } from './delegation.js';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * PD-ORCH-019 clauses 5 to 7: the `workflow` tool. An agent of a `lead` run hands it a script it wrote; the script runs in
 * the isolate (`workflow/isolate.ts`) in the background, starting agents and calling the tools its launching agent holds,
 * and the agent is told when it ends.
 *
 * Every agent a script starts is a delegated child of the launching agent, through the same port `delegate` uses, so the
 * run's child limits, write scopes and depth limit reach it unchanged. Every tool call a script makes goes through
 * `dispatchTool`, which the run host binds to the launching agent's own gate: its permission mode, sandbox, write fence,
 * hooks and approvals (clause 6). This module decides none of that.
 */

/** What the engine's delegation operations add for a workflow (`DelegationOps`, PD-ORCH-019 clause 7). */
export interface WorkflowOps {
  beginWorkflow(parentId: string, id: string): AbortSignal;
  endWorkflow(parentId: string, id: string, notice: string): void;
  claimForWorkflow(parentId: string, taskId: string): void;
  acknowledgeWorkflow(parentId: string, id: string): void;
}

export interface WorkflowToolDeps {
  readonly delegation: DelegationPort & WorkflowOps;
  readonly parentId: string;
  /** One tool call as the launching agent, through its gate. `interrupted` when a rest or a stop cut it short. */
  readonly dispatchTool: (name: string, args: Readonly<Record<string, unknown>>, callId: string, signal: AbortSignal) => Promise<{ readonly text: string; readonly isError: boolean; readonly interrupted?: boolean | undefined }>;
  /** Wall-clock milliseconds for the isolate's processor bound. */
  readonly now: () => number;
  /** The persona an `agent()` call that names none is delegated to. */
  readonly defaultPersona: string;
  /** Told after each change to a workflow's state, for a surface. */
  readonly onChange?: ((snapshot: WorkflowSnapshot) => void) | undefined;
  /** PD-ORCH-019 clause 8: where this agent's workflows and their journals are kept across a restart. */
  readonly store?: WorkflowStore | undefined;
  readonly memoryBytes?: number | undefined;
  readonly sliceMs?: number | undefined;
}

export type WorkflowState = 'running' | 'completed' | 'failed' | 'stopped' | 'interrupted';

/** PD-ORCH-019 clause 8: one workflow as the store keeps it. */
export interface StoredWorkflow {
  readonly id: string;
  readonly name: string;
  readonly script: string;
  readonly state: WorkflowState;
  readonly phase: string;
  readonly agentsStarted: number;
  readonly agentsEnded: number;
  readonly calls: number;
  readonly result: string;
  /** Whether the agent that started it has been told how it ended. */
  readonly notified: boolean;
}

/** PD-ORCH-019 clause 8: the store of one agent's workflows. The run host binds it to the session's writer. */
export interface WorkflowStore {
  /** This agent's workflows, oldest first, each with the journal recorded for it. */
  load(): readonly { readonly workflow: StoredWorkflow; readonly journal: readonly JournalEntry[] }[];
  save(workflow: StoredWorkflow): void;
  journal(workflowId: string): JournalSink;
}

export interface WorkflowSnapshot {
  readonly id: string;
  readonly name: string;
  readonly state: WorkflowState;
  readonly phase: string;
  readonly agentsStarted: number;
  readonly agentsEnded: number;
  readonly calls: number;
  readonly script: string;
  /** The script's return value as JSON text, or why it ended otherwise; '' while running. */
  readonly result: string;
}

interface Running {
  id: string;
  name: string;
  script: string;
  state: WorkflowState;
  phase: string;
  agentsStarted: number;
  agentsEnded: number;
  calls: number;
  result: string;
  log: string[];
  stop: AbortController;
  notified: boolean;
}

export const WORKFLOW_SCRIPT_LIMIT = 64_000;
export const WORKFLOW_ACTIVE_LIMIT = 4;
export const WORKFLOW_RESULT_CAP = 8_000;
const LOG_LINES = 20;
const INTERRUPTED_RESULT = 'It was cut off before it ended. Its recorded results are kept: start the same script again and it continues from them, repeating none of the work already reported.';
/** Tools a script may not call: itself (a script starts agents with `agent()`, and a nested script through an agent). */
const NOT_FROM_A_SCRIPT: ReadonlySet<string> = new Set(['workflow']);

export const WORKFLOW_TOOL_DESCRIPTION = [
  'Run a workflow: a JavaScript script you write that starts several agents and combines their results. Use it when the work splits into parts that can run side by side or in stages (review many files, try alternatives, implement then verify). For one part, use delegate instead; for work you can do yourself, do it yourself.',
  'action "start" needs name and script and returns at once with a workflow id; the workflow runs in the background and you are told when it ends. action "status" reports progress (give workflow_id, or omit it for all). action "stop" ends one.',
  'The script is the body of an async function: use await, and return the result (any JSON value). Inside it you have only these functions:',
  '- await agent(prompt, { persona, name, write_scope }) starts one agent with a complete, self-contained brief and resolves to its report text. persona and name are optional; write_scope is the list of path globs the agent will write.',
  '- await parallel([() => agent(...), () => agent(...)]) runs them side by side and resolves to the results in order.',
  '- await pipeline(items, stage1, stage2) runs every item through the stages in turn, the items side by side; a stage is (previousResult, item, index) => value.',
  '- await tool(name, args) calls one of your own tools (for example read_file, glob, grep, write_file, terminal) with your permissions and resolves to its result text.',
  '- await phase(title) names the step now running, shown to the user. await log(message) records a note.',
  'A failed call throws an Error with the reason; catch it or the workflow fails. There is no require, fetch, timer, Date or Math.random, and no other global.',
  'A workflow cut off by a pause or a restart is kept: you are told, and starting the very same script again continues it from the results already recorded.',
  'Example: const files = ["src/a.js", "src/b.js"]; await phase("Review"); const reviews = await parallel(files.map((f) => () => agent("Review " + f + " for bugs. Report each bug with its line.", { persona: "codebase-analyst", name: "review-" + f }))); return { reviews };',
].join('\n');

const schema = z.object({
  action: z.enum(['start', 'status', 'stop']).default('start'),
  name: z.string().optional(),
  script: z.string().optional(),
  workflow_id: z.string().optional(),
});
export type WorkflowArgs = z.infer<typeof schema>;

const cap = (text: string, limit: number): string => (text.length <= limit ? text : `${text.slice(0, limit)}\n… [${text.length - limit} characters omitted]`);
const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

export class WorkflowManager {
  private readonly workflows = new Map<string, Running>();
  private minted = 0;

  /** Clause 8: the journal each stored workflow was loaded with, by id, for a resume. */
  private readonly journals = new Map<string, readonly JournalEntry[]>();

  /**
   * Clause 8: the manager starts from what the store holds for its agent. A workflow the store still calls running was cut
   * off with its process, so it is interrupted; nothing is resumed here.
   */
  constructor(private readonly deps: WorkflowToolDeps) {
    for (const { workflow, journal } of deps.store?.load() ?? []) {
      const state: WorkflowState = workflow.state === 'running' ? 'interrupted' : workflow.state;
      this.workflows.set(workflow.id, { ...workflow, state, result: state === 'interrupted' && workflow.state === 'running' ? INTERRUPTED_RESULT : workflow.result, log: [], stop: new AbortController() });
      this.journals.set(workflow.id, journal);
      const n = Number(/^wf_(\d+)$/.exec(workflow.id)?.[1] ?? 0);
      if (n > this.minted) this.minted = n;
      if (state !== workflow.state) this.persist(this.workflows.get(workflow.id)!);
    }
  }

  /**
   * Clause 8: tells this agent, once, of each workflow that was cut off and that it has not been told of: the ending is
   * queued as any workflow's is, so it is the agent's next message when its turn ends. Called once the port is built.
   */
  announceInterrupted(): number {
    let told = 0;
    for (const w of this.workflows.values()) {
      if (w.state !== 'interrupted' || w.notified) continue;
      this.deps.delegation.beginWorkflow(this.deps.parentId, w.id);
      this.deps.delegation.endWorkflow(this.deps.parentId, w.id, this.endingOf(w));
      w.notified = true;
      this.persist(w);
      told += 1;
    }
    return told;
  }

  private persist(w: Running): void {
    this.deps.store?.save({ id: w.id, name: w.name, script: w.script, state: w.state, phase: w.phase, agentsStarted: w.agentsStarted, agentsEnded: w.agentsEnded, calls: w.calls, result: w.result, notified: w.notified });
  }

  private endingOf(w: Running): string {
    const head = `Workflow ${w.name} (${w.id}) ${w.state === 'completed' ? 'completed' : w.state === 'failed' ? 'failed' : w.state === 'stopped' ? 'was stopped' : 'was interrupted'}: ${w.agentsEnded} of ${w.agentsStarted} agents ended, ${w.calls} calls.`;
    const body = w.state === 'completed' ? `Result:\n${cap(w.result, WORKFLOW_RESULT_CAP)}` : w.state === 'failed' ? `Error: ${cap(w.result, WORKFLOW_RESULT_CAP)}\nFix the script and start it again, or do the work another way.` : w.result;
    return `${head}\n${body}`;
  }

  snapshots(): WorkflowSnapshot[] {
    return [...this.workflows.values()].map((w) => this.snapshotOf(w));
  }

  private snapshotOf(w: Running): WorkflowSnapshot {
    return { id: w.id, name: w.name, state: w.state, phase: w.phase, agentsStarted: w.agentsStarted, agentsEnded: w.agentsEnded, calls: w.calls, script: w.script, result: w.result };
  }

  private changed(w: Running): void {
    this.persist(w);
    this.deps.onChange?.(this.snapshotOf(w));
  }

  /**
   * Starts `script` and returns its id at once. Clause 8: where this agent holds an interrupted workflow of the same
   * script, that workflow is started again over its journal under its own id, so its recorded results are not repeated.
   */
  start(name: string, script: string): { ok: true; id: string; resumed: boolean } | { ok: false; reason: string } {
    if (script.trim() === '') return { ok: false, reason: 'The script is empty. Give the body of an async function that calls agent(), parallel() or tool() and returns a result.' };
    if (script.length > WORKFLOW_SCRIPT_LIMIT) return { ok: false, reason: `The script is ${script.length} characters; the limit is ${WORKFLOW_SCRIPT_LIMIT}.` };
    const active = [...this.workflows.values()].filter((w) => w.state === 'running').length;
    if (active >= WORKFLOW_ACTIVE_LIMIT) return { ok: false, reason: `You already have ${active} workflows running; wait for one to end or stop one first.` };
    const earlier = [...this.workflows.values()].find((x) => x.state === 'interrupted' && x.script.trim() === script.trim());
    const recorded = earlier === undefined ? [] : this.deps.store?.load().find((s) => s.workflow.id === earlier.id)?.journal ?? this.journals.get(earlier.id) ?? [];
    if (earlier === undefined) this.minted += 1;
    const id = earlier?.id ?? `wf_${this.minted}`;
    // A resumed workflow's agents that already reported are counted from its journal: the host is not asked for them again.
    const reported = recorded.filter((e) => e.kind === 'agent' && e.outcome !== undefined).length;
    const w: Running = { id, name: earlier?.name ?? (name.trim() === '' ? id : name.trim()), script, state: 'running', phase: earlier?.phase ?? '', agentsStarted: reported, agentsEnded: reported, calls: 0, result: '', log: [], stop: new AbortController(), notified: false };
    this.workflows.set(id, w);
    const runStop = this.deps.delegation.beginWorkflow(this.deps.parentId, id);
    let rested = false;
    const onRunStop = (): void => { rested = true; w.stop.abort(); };
    if (runStop.aborted) onRunStop(); else runStop.addEventListener('abort', onRunStop, { once: true });
    const sink: JournalSink = this.deps.store?.journal(id) ?? { append: () => undefined, truncate: () => undefined };
    const host = journaledHost(this.hostFor(w), recorded, sink);
    this.changed(w);
    void runWorkflowScript(script, host, { now: this.deps.now, signal: w.stop.signal, memoryBytes: this.deps.memoryBytes, sliceMs: this.deps.sliceMs })
      .then((outcome) => { runStop.removeEventListener('abort', onRunStop); this.finish(w, outcome, rested); });
    return { ok: true, id, resumed: earlier !== undefined };
  }

  private finish(w: Running, outcome: WorkflowOutcome, rested: boolean): void {
    w.calls = outcome.calls;
    if (outcome.ok) { w.state = 'completed'; w.result = JSON.stringify(outcome.value); }
    else if (outcome.reason === 'stopped') { w.state = rested ? 'interrupted' : 'stopped'; w.result = rested ? INTERRUPTED_RESULT : 'The workflow was stopped.'; }
    else { w.state = 'failed'; w.result = outcome.error; }
    // A workflow the run's rest cut off is not told now: its agent is at rest too. The next port of this agent tells it.
    w.notified = w.state !== 'interrupted';
    this.changed(w);
    this.deps.delegation.endWorkflow(this.deps.parentId, w.id, this.endingOf(w));
  }

  private hostFor(w: Running): LinkedWorkflowHost {
    const { delegation, parentId } = this.deps;
    return {
      call: async (call: WorkflowCall, link: CallLink): Promise<unknown> => {
        w.calls = Math.max(w.calls, call.seq + 1);
        const p = (call.payload ?? {}) as Record<string, unknown>;
        if (call.kind === 'phase') { w.phase = textOf(p['title']); this.changed(w); return null; }
        if (call.kind === 'log') { w.log.push(textOf(p['message'])); if (w.log.length > LOG_LINES) w.log.shift(); return null; }
        if (call.kind === 'tool') {
          const name = textOf(p['name']);
          if (name === '') throw new Error('tool(name, args) needs the name of one of your tools.');
          if (NOT_FROM_A_SCRIPT.has(name)) throw new Error(`A workflow script cannot call ${name}; start agents with agent().`);
          const args = p['args'] !== null && typeof p['args'] === 'object' && !Array.isArray(p['args']) ? p['args'] as Record<string, unknown> : {};
          const r = await this.deps.dispatchTool(name, args, `${w.id}-c${call.seq}`, w.stop.signal);
          if (r.interrupted === true || w.stop.signal.aborted) throw new WorkflowInterrupted(r.text);
          if (r.isError) throw new Error(r.text);
          return r.text;
        }
        const prompt = textOf(p['prompt']);
        if (prompt.trim() === '') throw new Error('agent(prompt) needs a prompt: the complete brief for the agent.');
        const scope = Array.isArray(p['write_scope']) ? p['write_scope'].filter((s): s is string => typeof s === 'string') : [];
        // Clause 8: a child an earlier run of this script started for this call, and the run still knows, is waited for.
        let taskId = link.resumeTaskId !== null && delegation.backgroundOutput(parentId, link.resumeTaskId, 'summary').status !== 'not_found' ? link.resumeTaskId : null;
        if (taskId === null) {
          const started = await delegation.delegate(parentId, {
            persona: textOf(p['persona']) || this.deps.defaultPersona, taskName: textOf(p['name']) || `${w.name}-${w.agentsStarted + 1}`, task: prompt,
            dependsOn: [], inheritedContext: [], category: '', runInBackground: true, attachArtifacts: [], writeScope: scope,
          });
          if (started.status === 'rejected') throw new Error(started.message);
          taskId = started.taskId;
          link.started(taskId);
        }
        const started = { taskId };
        delegation.claimForWorkflow(parentId, started.taskId);
        w.agentsStarted += 1;
        this.changed(w);
        const waited = await delegation.waitForTasks(parentId, [started.taskId]);
        if ('interrupted' in waited) throw new WorkflowInterrupted(waited.interrupted);
        if ('refused' in waited) throw new Error(waited.refused);
        if (w.stop.signal.aborted) throw new WorkflowInterrupted('the workflow was stopped');
        w.agentsEnded += 1;
        this.changed(w);
        const output = delegation.backgroundOutput(parentId, started.taskId, 'verbatim');
        return output.status === 'ok' ? output.text : waited.text;
      },
    };
  }

  stop(id: string): { ok: true; name: string } | { ok: false; reason: string } {
    const w = this.workflows.get(id);
    if (w === undefined) return { ok: false, reason: `No workflow ${id}. ${this.known()}` };
    if (w.state !== 'running') return { ok: false, reason: `Workflow ${w.name} (${id}) already ended: ${w.state}.` };
    w.stop.abort();
    return { ok: true, name: w.name };
  }

  private known(): string {
    const ids = [...this.workflows.keys()];
    return ids.length === 0 ? 'You have started none.' : `Yours: ${ids.join(', ')}.`;
  }

  status(id: string | undefined): { ok: true; text: string } | { ok: false; reason: string } {
    const chosen = id === undefined || id === '' ? [...this.workflows.values()] : [this.workflows.get(id)].filter((w): w is Running => w !== undefined);
    if (id !== undefined && id !== '' && chosen.length === 0) return { ok: false, reason: `No workflow ${id}. ${this.known()}` };
    if (chosen.length === 0) return { ok: true, text: 'You have started no workflow.' };
    // An agent that reads an ending here has been told: the notice waiting for its turn's end would say it twice.
    for (const w of chosen) if (w.state !== 'running') { this.deps.delegation.acknowledgeWorkflow(this.deps.parentId, w.id); if (!w.notified) { w.notified = true; this.persist(w); } }
    return { ok: true, text: chosen.map((w) => [
      `workflow: ${w.name} (${w.id})`,
      `state: ${w.state}`,
      `phase: ${w.phase === '' ? '(none named)' : w.phase}`,
      `agents: ${w.agentsEnded} of ${w.agentsStarted} ended`,
      `calls: ${w.calls}`,
      ...(w.log.length === 0 ? [] : [`log:\n${w.log.map((l) => `- ${l}`).join('\n')}`]),
      ...(w.state === 'running' ? [] : [`${w.state === 'completed' ? 'result' : 'ended'}: ${cap(w.result, WORKFLOW_RESULT_CAP)}`]),
    ].join('\n')).join('\n\n') };
  }
}

export function workflowTool(manager: WorkflowManager): ToolExecutor<WorkflowArgs> {
  return {
    name: 'workflow',
    description: WORKFLOW_TOOL_DESCRIPTION,
    schema,
    label: (a) => (a.action === 'start' ? `workflow start ${a.name ?? ''}`.trim() : `workflow ${a.action} ${a.workflow_id ?? ''}`.trim()),
    execute: async (a) => {
      await Promise.resolve();
      if (a.action === 'status') { const r = manager.status(a.workflow_id); return r.ok ? observation(r.text) : errorObservation(r.reason); }
      if (a.action === 'stop') {
        if (a.workflow_id === undefined || a.workflow_id === '') return errorObservation('stop needs workflow_id.');
        const r = manager.stop(a.workflow_id);
        return r.ok ? observation(`Workflow ${r.name} (${a.workflow_id}) is being stopped; you are told when it has ended.`) : errorObservation(r.reason);
      }
      if (a.script === undefined) return errorObservation('start needs script: the body of an async function.');
      const r = manager.start(a.name ?? '', a.script);
      return r.ok
        ? observation(`Workflow ${a.name?.trim() || r.id}${r.resumed ? ' continues from its recorded results; it' : ''} started in the background as ${r.id}. You are told when it ends; until then do other work or end your turn. Read its progress with action "status".`)
        : errorObservation(r.reason);
    },
  };
}
