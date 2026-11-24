import type { WorkflowCall, WorkflowCallKind, WorkflowHost } from './isolate.js';

/**
 * PD-ORCH-018 clause 8: the journal of a workflow script's calls. Each result the script received is recorded as it
 * arrives, in the order the script made the calls. Started again over the same journal, the script receives the recorded
 * results in that order without the work being repeated, and continues with the host from the first call that has none.
 *
 * A replay holds only while the script makes the same calls. A call that differs from the one recorded at its position
 * means the script is not the one the journal was written for (or no longer reads the same), so the replay ends there:
 * that call and every later one go to the host, and the entries from that position on are dropped.
 *
 * An `agent` call is recorded twice: when its child is admitted (the child's task id, no outcome) and when its report
 * arrives. A script started over a journal that holds the first and not the second waits for that child and starts no
 * second one, so a workflow cut off while its agents ran picks them up again.
 */
export interface JournalEntry {
  readonly seq: number;
  readonly kind: WorkflowCallKind;
  /** The call's arguments, as canonical JSON text: what a replayed call is compared with. */
  readonly payload: string;
  /** Absent while the call is still unanswered: an `agent` call whose child was started and has not been waited out. */
  readonly outcome?: { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string } | undefined;
  /** The child task an `agent` call started, recorded when the child is admitted. */
  readonly taskId?: string | undefined;
}

/** What a journaled host hands the host beneath it with a call. */
export interface CallLink {
  /** The child a previous run of this script started for this same call and never waited out, or null: wait for it, start none. */
  readonly resumeTaskId: string | null;
  /** Tells the journal the child this call started, the moment it is admitted. */
  readonly started: (taskId: string) => void;
}

/** A host that takes the journal's link with each call. */
export interface LinkedWorkflowHost {
  call(call: WorkflowCall, link: CallLink): Promise<unknown>;
}

export interface JournalSink {
  /**
   * Called when a call starts a child (no outcome yet) and again when the call is answered. A later entry for a `seq`
   * replaces the earlier and keeps its `taskId`. Entries can arrive out of `seq` order.
   */
  append(entry: JournalEntry): void;
  /** Called when a replay diverged at `seq`: the entries from there on no longer describe this script. */
  truncate(seq: number): void;
}

/** JSON text with object keys sorted, so two equal payloads compare equal whatever order their keys were written in. */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v !== null && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v).sort()) out[key] = sorted((v as Record<string, unknown>)[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sorted(value === undefined ? null : value));
}

export interface JournaledHost extends WorkflowHost {
  /** How many calls were answered from the journal. */
  readonly replayed: () => number;
}

/**
 * `host`, answering from `recorded` while the script's calls match it. `recorded` is read by `seq`; a gap ends the replay
 * at the gap, since a call with no recorded result is one whose work may not have finished.
 */
export function journaledHost(host: LinkedWorkflowHost | WorkflowHost, recorded: readonly JournalEntry[], sink: JournalSink): JournaledHost {
  const bySeq = new Map<number, JournalEntry>();
  for (const entry of recorded) bySeq.set(entry.seq, entry);
  let live = Number.POSITIVE_INFINITY;
  let replayed = 0;
  return {
    replayed: () => replayed,
    call: async (call: WorkflowCall): Promise<unknown> => {
      const payload = canonicalJson(call.payload);
      let resumeTaskId: string | null = null;
      if (call.seq < live) {
        const entry = bySeq.get(call.seq);
        const same = entry !== undefined && entry.kind === call.kind && entry.payload === payload;
        if (same && entry.outcome !== undefined) {
          replayed += 1;
          if (entry.outcome.ok) return entry.outcome.value;
          throw new Error(entry.outcome.error);
        }
        // The same call, its child started and never waited out: the host waits for that child and starts no second one.
        // Calls made side by side with it may each be in that state, so the replay does not end here.
        if (same && entry.taskId !== undefined) resumeTaskId = entry.taskId;
        else {
          // The first call the journal cannot answer: from here on the host does the work.
          live = call.seq;
          if (entry !== undefined || [...bySeq.keys()].some((seq) => seq > call.seq)) sink.truncate(call.seq);
        }
      }
      let taskId: string | undefined = resumeTaskId ?? undefined;
      const link: CallLink = {
        resumeTaskId,
        started: (id) => { taskId = id; sink.append({ seq: call.seq, kind: call.kind, payload, taskId: id }); },
      };
      try {
        const value = await host.call(call, link);
        sink.append({ seq: call.seq, kind: call.kind, payload, outcome: { ok: true, value: value === undefined ? null : value }, ...(taskId === undefined ? {} : { taskId }) });
        return value;
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        // A call that failed because the workflow was stopped or the run came to rest is not a result: it is asked again.
        if (!(cause instanceof WorkflowInterrupted)) sink.append({ seq: call.seq, kind: call.kind, payload, outcome: { ok: false, error }, ...(taskId === undefined ? {} : { taskId }) });
        throw cause instanceof Error ? cause : new Error(error);
      }
    },
  };
}

/** Thrown by a host for a call cut off by a stop or a rest: the journal records nothing for it, so a resume asks it again. */
export class WorkflowInterrupted extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowInterrupted';
  }
}
