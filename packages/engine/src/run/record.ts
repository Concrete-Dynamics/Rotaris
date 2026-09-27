import type { SessionId } from '@rotaris/kernel';
import type { ChatMessage } from '@rotaris/model';
import type { AgentMessageRow, StoreDal } from '@rotaris/store';
import type { SessionWriter } from '../session-writer.js';
import type { ConversationRecorder } from './conversation.js';

/**
 * PD-ORCH-005 clauses 1 and 12 — the conversation record: every agent's conversation, the iteration root's and every
 * child's at every depth, kept as it happens under the agent's task id, and the record a paused, stopped, quit or crashed
 * run is resumed from.
 *
 * The record is fed by the `Conversation` itself (the spike's finding: `push` and `replace` are the only two ways a
 * conversation changes), so a message reaches the record at the moment it joins the conversation and never by a copy
 * taken afterwards. A compression is a `replace`, and it is written as a replacement of the whole conversation — a
 * resume sends the compressed conversation, and the full history stays in the table.
 *
 * The iteration an entry belongs to is carried with it, which is what the transcript clear reads: it removes the
 * records of closed iterations and keeps an open one's (clause 12).
 */
export class ConversationRecord {
  constructor(private readonly writer: SessionWriter, private readonly dal: StoreDal | undefined, private readonly sessionId: SessionId) {}

  /** The recorder an agent's turn hands its `Conversation`: every push one message, every replace one replacement. */
  recorder(taskId: string, iteration: number): ConversationRecorder {
    return {
      appended: (message) => { this.writer.recordAgentMessage(taskId, iteration, 'message', message); },
      replaced: (messages) => { this.writer.recordAgentMessage(taskId, iteration, 'replacement', messages); },
    };
  }

  /**
   * REQ-ORCH-088's fallback retry starts the child's conversation again from its payload, so the record says so: an
   * empty replacement, after which the second attempt's messages are the conversation a resume would send.
   */
  restarted(taskId: string, iteration: number): void {
    this.writer.recordAgentMessage(taskId, iteration, 'replacement', []);
  }

  /** The conversation a resume sends the agent's model: its last replacement, then every message after it. Empty with no store. */
  load(taskId: string): ChatMessage[] {
    return this.dal ? conversationOf(this.dal.agentConversation(this.sessionId, taskId)) : [];
  }
}

/**
 * The conversation an agent's record describes, from its entries as `agentConversation` reads them: the last
 * replacement's messages (when the read starts at one), then each message in order. Pure, so the decode is tested
 * apart from the store.
 */
export function conversationOf(rows: readonly AgentMessageRow[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const row of rows) {
    const body: unknown = JSON.parse(row.body);
    if (row.kind === 'replacement') {
      out.length = 0;
      if (Array.isArray(body)) out.push(...(body as ChatMessage[]));
    } else {
      out.push(body as ChatMessage);
    }
  }
  return out;
}
