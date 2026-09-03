import { asSessionId, err, ok, type Clocks, type MachineId, type Result, type SessionId } from '@rotaris/kernel';
import type { SessionRecord, TranscriptRow } from '@rotaris/contracts';
import { RELEASE_PAGE_SIZE, type SessionRow, type StoreDal } from '@rotaris/store';
import { ProjectionOwner, type Publisher } from './projection-owner.js';
import { SequenceCounters } from './sequence.js';
import { SessionWriter, toTranscriptRow } from './session-writer.js';

/**
 * ADR-0013 in miniature — the run host's registry of live sessions: for each,
 * the writer that holds its lock and the projection owner the writer feeds.
 * The run loop (ADR-0008 onward) lands on top of this; today a session is
 * created, its history opened, and the user's prompt recorded as row 0
 * (REQ-CHAT-011). No run executes, so the status stays `idle`.
 */
export interface SessionsDeps {
  readonly clocks: Clocks;
  readonly publisher: Publisher;
  readonly pid: number;
  readonly host: MachineId;
  readonly retentionCap: number;
  readonly warn: (message: string) => void;
  readonly mintSessionId: () => string;
}

interface Live {
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly dal: StoreDal;
}

export function toSessionRecord(r: SessionRow): SessionRecord {
  return {
    id: r.session_id,
    executionStatus: r.execution_status,
    workspaceRoot: r.workspace_root,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    historyOpen: r.history_open === 1,
    truncation: { truncated: r.truncated === 1, droppedCount: r.dropped_count, cap: r.trim_cap, lastTrimAt: r.last_trim_at },
    agents: [],
    pendingApprovals: [],
    pendingQuestions: [],
    tokenUsage: { input: 0, output: 0 },
  };
}

export class Sessions {
  private readonly live = new Map<SessionId, Live>();
  readonly seq = new SequenceCounters();

  constructor(private readonly deps: SessionsDeps) {}

  /** REQ-CHAT-011 with no session: start one and record the prompt as row 0, kind `user`. */
  start(dal: StoreDal, workspaceRoot: string, prompt: string): Result<SessionId, { code: string; reason: string }> {
    const sessionId = asSessionId(this.deps.mintSessionId());
    let owner: ProjectionOwner | undefined;
    const created = SessionWriter.create(
      {
        dal, sessionId, wall: this.deps.clocks.wall, retentionCap: this.deps.retentionCap, warn: this.deps.warn,
        onCommitted: (c) => owner?.onCommitted(c),
      },
      { workspaceRoot, pid: this.deps.pid, host: this.deps.host },
    );
    if (!created.ok) {
      return err(created.error.code === 'lock-held'
        ? { code: 'lock-held', reason: `held by pid ${created.error.holder.pid} on ${created.error.holder.host}` }
        : { code: 'store', reason: created.error.reason });
    }
    const writer = created.value;
    owner = new ProjectionOwner({
      sessionId, seq: this.seq, timers: this.deps.clocks.timers, publisher: this.deps.publisher,
      readSession: () => toSessionRecord(dal.getSession(sessionId)!),
      readResident: () => dal.residentRows(sessionId).map(toTranscriptRow),
    });
    this.live.set(sessionId, { writer, owner, dal });
    const row = writer.appendRow('user', prompt, true);
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });
    return ok(sessionId);
  }

  /** REQ-CHAT-011 with a loaded session and no active run: append the user row. */
  prompt(sessionId: SessionId, prompt: string): Result<TranscriptRow, { code: string; reason: string }> {
    const s = this.live.get(sessionId);
    if (!s) return err({ code: 'not-live', reason: `${sessionId} is not a live session` });
    const row = s.writer.appendRow('user', prompt, true);
    if (!row.ok) return err({ code: row.error.code, reason: 'reason' in row.error ? row.error.reason : String(row.error.code) });
    return ok(row.value);
  }

  attach(sessionId: SessionId): boolean {
    const s = this.live.get(sessionId);
    if (!s) return false;
    s.owner.attach();
    return true;
  }

  reconcile(sessionId: SessionId): boolean {
    const s = this.live.get(sessionId);
    if (!s) return false;
    s.owner.reconcile();
    return true;
  }

  /** REQ-SESSION-192 / REQ-CHAT-165: a span older than `beforeIndex`, served from any page, oldest first. */
  pageOlder(sessionId: SessionId, beforeIndex: number): { rows: TranscriptRow[]; oldest: boolean } | undefined {
    const s = this.live.get(sessionId);
    if (!s) return undefined;
    const rows = s.dal.rowsBefore(sessionId, beforeIndex, RELEASE_PAGE_SIZE).map(toTranscriptRow).reverse();
    const oldestIndex = s.dal.oldestRowIndex(sessionId);
    const oldest = rows.length === 0 || (oldestIndex !== null && rows[0]!.index <= oldestIndex);
    return { rows, oldest };
  }

  owner(sessionId: SessionId): ProjectionOwner | undefined {
    return this.live.get(sessionId)?.owner;
  }
  writer(sessionId: SessionId): SessionWriter | undefined {
    return this.live.get(sessionId)?.writer;
  }

  /** ADR-0014: at shutdown every pending publication is flushed and every lock released. */
  closeAll(): void {
    for (const [id, s] of this.live) {
      s.owner.flushPending();
      s.writer.release(this.deps.pid, this.deps.host);
      this.seq.forget(id);
    }
    this.live.clear();
  }
}
