import { createHash } from 'node:crypto';
import type { SessionId } from '@rotaris/kernel';
import type { ChatMessage } from '@rotaris/model';
import type { Persona } from '../children/personas.js';
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

  /**
   * PD-ORCH-005 clause 14 with OQ-105 as ruled (R-071, `PD-ORCH-005` revision 7): the check one execution of an agent makes
   * at its first model step, taken of its persona's own definition (`definition`). An agent with no fingerprint recorded has
   * it recorded — what it started with. An agent that has one is being resumed (a task id is never executed twice
   * otherwise), and when either digest differs the run states, as a warning, which agent resumed under changed
   * instructions: an issue at warning severity with its timeline entry, and a line in the transcript. The fingerprint is
   * then replaced by the current one, so a change is stated once and a later resume under the same definition states
   * nothing. A fingerprint recorded before the ruling, of the whole request, is not comparable with a definition's: it is
   * replaced and nothing is stated, as for an agent that had none. Only the first call of an execution acts, so REQ-ORCH-088's
   * retry and REQ-ORCH-095's re-prompt, which run within it, compare nothing. Nothing with no store.
   *
   * Until the ruling the check was taken of the system prompt and the tool listing the step's request carried, and the
   * first was kept for every comparison: a playbook a new classification chose, a skill, the MCP section, a workspace
   * instruction file the run's own agents edited, or a presenter-bound tool each warned for an agent whose persona no one
   * had edited, and at every resume while it differed (live-run findings a71-3 and G1).
   */
  fingerprint(taskId: string, agentName: string, iteration: number, definition: PersonaDefinition): FingerprintCheck {
    let checked = false;
    return () => {
      if (checked || !this.dal) return;
      checked = true;
      const current = fingerprintOf(definition);
      const started = this.dal.agentFingerprintOf(this.sessionId, taskId);
      if (!started) { this.writer.recordAgentFingerprint(taskId, iteration, current.instructions, current.tools); return; }
      if (!isDefinitionPrint(started.instructions) || !isDefinitionPrint(started.tools)) { this.writer.replaceAgentFingerprint(taskId, current.instructions, current.tools); return; }
      const instructionsChanged = started.instructions !== current.instructions;
      const toolsChanged = started.tools !== current.tools;
      if (!instructionsChanged && !toolsChanged) return;
      const what = instructionsChanged && toolsChanged ? 'instructions and tool definitions' : instructionsChanged ? 'instructions' : 'tool definitions';
      const message = `Agent ${agentName} (${taskId}) resumed under changed instructions: its persona's ${what} changed since it last ran.`;
      this.writer.recordIssue({ kind: 'resumed_under_changed_instructions', severity: 'warning', actor: agentName, message, metadata: { task_id: taskId, iteration, instructions_changed: instructionsChanged, tools_changed: toolsChanged } });
      this.writer.appendRow('system', message, true);
      // OQ-105 as ruled: once per change — the next resume compares against what this one ran with.
      this.writer.replaceAgentFingerprint(taskId, current.instructions, current.tools);
    };
  }

  /**
   * Every message the agent's record holds, including those a compression or REQ-ORCH-088's restart replaced — what the
   * agent was ever told, where `load` is only what a resume sends. Empty with no store. A row that does not decode is
   * skipped: `load` never reads the rows before the last replacement, so this read must not fail a resume `load` allows.
   */
  everRecorded(taskId: string): ChatMessage[] {
    if (!this.dal) return [];
    const out: ChatMessage[] = [];
    for (const row of this.dal.agentMessagesOf(this.sessionId, taskId)) {
      let body: unknown;
      try { body = JSON.parse(row.body); } catch { continue; }
      if (row.kind === 'replacement') { if (Array.isArray(body)) out.push(...(body as ChatMessage[])); } else out.push(body as ChatMessage);
    }
    return out;
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

/** PD-ORCH-005 clause 14: made once at an agent's first model step, so the comparison happens where its execution begins. */
export type FingerprintCheck = () => void;

/**
 * OQ-105 as ruled (R-071, `PD-ORCH-005` revision 7 clause 14): what an agent's fingerprint is taken of — its persona's
 * own definition, and nothing the run adds around it. `instructions` is the persona's own system prompt, before the
 * playbook (REQ-ORCH-019), the context units (REQ-WORKSPACE-060) and the MCP section (REQ-MCP-101) are appended; `tools` is
 * its own tool declaration — the declared tools (REQ-CONFIG-102), `tool_restrictions` (REQ-CONFIG-103) and the two flags
 * that bound what it may hold — not the listing a request offered, which the grant, the mode, the presenter and the
 * connected servers also shape. Null `tools` for a persona the run cannot resolve.
 */
export interface PersonaDefinition {
  readonly instructions: string;
  readonly tools: { readonly declared: readonly string[]; readonly coordinatorOnly: boolean; readonly readOnly: boolean; readonly restrictions: Readonly<Record<string, readonly string[]>> | null } | null;
}

/** The definition of `persona` an agent instructed with `systemPrompt` runs under (OQ-105 as ruled). */
export function personaDefinitionOf(systemPrompt: string, persona: Pick<Persona, 'tools' | 'coordinatorOnly' | 'readOnly' | 'toolRestrictions'> | null | undefined): PersonaDefinition {
  return {
    instructions: systemPrompt,
    tools: persona ? { declared: [...persona.tools].sort(), coordinatorOnly: persona.coordinatorOnly, readOnly: persona.readOnly, restrictions: persona.toolRestrictions ?? null } : null,
  };
}

/** The mark a fingerprint of a persona's definition carries, which tells it apart from one taken of a request before OQ-105's ruling. */
const DEFINITION_PRINT = 'persona:';
function isDefinitionPrint(digest: string): boolean { return digest.startsWith(DEFINITION_PRINT); }

/**
 * PD-ORCH-005 clause 14 with OQ-105 as ruled: the fingerprint of a persona's definition — the SHA-256 of its instructions
 * and of its tool declaration, each marked `persona:`. The declaration is serialised with every object's keys sorted and
 * the declared tools in name order, so the order a configuration lists them in is not a change.
 */
export function fingerprintOf(definition: PersonaDefinition): { readonly instructions: string; readonly tools: string } {
  const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
  const tools = definition.tools === null ? null : { ...definition.tools, declared: [...definition.tools.declared].sort() };
  return { instructions: `${DEFINITION_PRINT}${sha(definition.instructions)}`, tools: `${DEFINITION_PRINT}${sha(stableJson(tools))}` };
}

/** JSON with every object's keys in sorted order, so two equal values serialise alike whatever order they were built in. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
