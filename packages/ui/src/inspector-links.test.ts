import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionArtifactLink, type SessionRecord } from '@rotaris/contracts';
import { agentArtifacts, personaArtifacts, runLevelAgent } from './agents.js';
import { Inspector, NO_ARTIFACTS } from './Inspector.js';
import { ARTIFACTS_EMPTY, PersonaWindow } from './PersonaWindow.js';
import { useShellState } from './shell-state.js';

/**
 * Live-run finding K1 (R-067): in every screenshot of the first live run the inspector drew "No tools resolved." for the
 * run-level agent and "No artifacts yet — this build has no artifact store." for every agent, although the orchestrator had
 * made up to fifteen calls and the store held seven reports. REQ-MONITOR-060/061: the run-level agent shows the tools its
 * run resolved, else the persona's declared tools stand in, marked from its history; REQ-MONITOR-052/068/069: the inspector
 * and the persona window link the artifacts an agent produced and received.
 */
const ORCHESTRATOR_DECLARED = ['read_file', 'grep', 'write_file', 'terminal', 'delegate', 'todo', 'ask_questions'];
const entry = { persona: 'orchestrator', model: 'm', reasoning: 'medium', tools: ORCHESTRATOR_DECLARED };
const link = (over: Partial<SessionArtifactLink>): SessionArtifactLink => ({ id: 'art_00000001', slug: 'the-plan', title: 'The plan', status: 'published', producer: 'orchestrator', ready: true, consumedBy: [], ...over });
const child = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'coder-1', givenName: 'Coder', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: 'do it', model: 'm',
  depth: 1, background: false, category: '', spawnedAt: '2026-09-29T10:00:00.000Z', completedAt: null, toolCalls: 1, delegationTask: 'do it', reasoning: 'medium', contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file'], grantRecorded: true, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, ...over,
});
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-29T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-29T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 15, agents: 1, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY },
  entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryPersona: null, entryStalledSeconds: null, entryToolCalls: null, ...over,
});
const inspector = (s: SessionRecord, selected: string, runLevel: AgentRecord | null, onOpenArtifact?: (id: string) => void) => renderToStaticMarkup(createElement(Inspector, {
  session: s, rows: [], personas: [{ role: 'orchestrator', tools: ORCHESTRATOR_DECLARED, thinking: null, effectiveModel: 'm' }], runLevel, selectedAgentId: selected, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: true, resting: false, nowIso: null,
  onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined, onOpenArtifact,
}));
const chips = (html: string, testId: string) => [...(html.match(new RegExp(`data-testid="${testId}"[\\s\\S]*?</div>`))?.[0] ?? '').matchAll(/data-tool="([^"]+)" data-state="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
const linkIds = (html: string, testId: string) => [...(html.match(new RegExp(`data-testid="${testId}"[\\s\\S]*?</span></span></span>`))?.[0] ?? '').matchAll(/data-artifact-id="([^"]+)"/g)].map((m) => m[1]);

describe('REQ-MONITOR-060/061 (live-run finding K1): the run-level agent\'s tools', () => {
  it('the set the live run resolved, with its history and — while it runs — its active calls', () => {
    const s = session({ entryTools: { resolved: ['read_file', 'delegate', 'todo'], called: ['delegate'], active: ['todo'] } });
    const root = runLevelAgent(s, entry, false)!;
    expect(root.grantedTools).toEqual(['read_file', 'delegate', 'todo']);
    expect(root.calledTools).toEqual(['delegate']);
    expect(root.activeTools).toEqual(['todo']);
    // At rest nothing is in flight, whatever the record last said.
    expect(runLevelAgent(session({ executionStatus: 'completed', entryTools: { resolved: [], called: ['delegate'], active: ['todo'] } }), entry, false)!.activeTools).toEqual([]);
  });

  it('with nothing resolved the persona\'s declared tools stand in, marked from the history; the inspector never says "No tools resolved."', () => {
    const s = session({ executionStatus: 'completed', entryTools: { resolved: [], called: ['delegate', 'todo'], active: [] } });
    const root = runLevelAgent(s, entry, false)!;
    expect(root.grantedTools).toEqual(ORCHESTRATOR_DECLARED);
    const html = inspector(s, RUN_AGENT_ID, root);
    expect(html).not.toContain('No tools resolved.');
    expect(chips(html, 'inspector-chips')).toEqual(['read_file:not used', 'grep:not used', 'write_file:not used', 'terminal:not used', 'delegate:used', 'todo:used', 'ask_questions:not used']);
  });

  it('REQ-MONITOR-061: a running coordinator shows its resolved set — no write, terminal or commit tool it cannot call', () => {
    const s = session({ entryTools: { resolved: ['read_file', 'grep', 'delegate', 'todo', 'ask_questions'], called: [], active: [] } });
    const html = inspector(s, RUN_AGENT_ID, runLevelAgent(s, entry, false));
    const names = chips(html, 'inspector-chips').map((c) => c.split(':')[0]);
    expect(names).toEqual(['read_file', 'grep', 'delegate', 'todo', 'ask_questions']);
  });

  /**
   * The verifier's finding on K1: a follow-up or continued run already holds `runStartedAt`, so the run-level agent is
   * presented live while the run is `starting`, but its root port resolves only after the pre-flight (`Run.iterate`). The
   * declared set stood in there — a coordinator's write, terminal and commit tools included, which REQ-MONITOR-061 forbids
   * for a running run-level agent, and REQ-MONITOR-060 lets the declared tools stand in only where the persona has no live
   * instance. While it is live and nothing has resolved, nothing is listed.
   */
  it('REQ-MONITOR-060/061: a live run-level agent whose port has not resolved yet lists no declared tool — no withheld tool stands in', () => {
    for (const executionStatus of ['starting', 'running']) {
      const s = session({ executionStatus, entryTools: { resolved: [], called: ['delegate'], active: [] } });
      const root = runLevelAgent(s, entry, false)!;
      expect(root.live).toBe(true);
      expect(root.grantedTools).toEqual([]);
      const html = inspector(s, RUN_AGENT_ID, root);
      expect(chips(html, 'inspector-chips')).toEqual([]);
      for (const withheld of ['write_file', 'terminal']) expect(html).not.toContain(`data-tool="${withheld}"`);
      expect(html).toContain('No tools resolved.');
      const pw = renderToStaticMarkup(createElement(PersonaWindow, {
        persona: 'orchestrator', session: s, rows: [], runLevel: root, declaredTools: ORCHESTRATOR_DECLARED, selectedAgentId: RUN_AGENT_ID, onSelectTab: () => undefined, nowIso: null, compressionThresholdPercent: 60,
        onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }),
      }));
      expect(chips(pw, 'persona-chips')).toEqual([]);
      for (const withheld of ['write_file', 'terminal']) expect(pw).not.toContain(`data-tool="${withheld}"`);
    }
    // Once the run is over the persona has no live instance and its declared tools stand in again (REQ-MONITOR-060).
    const rest = runLevelAgent(session({ executionStatus: 'completed', entryTools: { resolved: [], called: [], active: [] } }), entry, false)!;
    expect(rest.grantedTools).toEqual(ORCHESTRATOR_DECLARED);
  });
});

describe('REQ-MONITOR-044/052/068/069 (live-run finding K1): artifact links', () => {
  const plan = link({ id: 'art_plan0001', slug: 'the-plan', producer: 'orchestrator', consumedBy: ['coder-1'] });
  const report = link({ id: 'art_rep00001', slug: 'coder-1-report', title: 'coder-1 report', status: 'failed', ready: false, producer: 'coder-1' });
  const other = link({ id: 'art_oth00001', slug: 'unrelated', producer: 'tester-1' });

  it('an agent\'s produced and received artifacts, by its name', () => {
    expect(agentArtifacts({ name: 'coder-1' }, [plan, report, other])).toEqual({ produced: [report], received: [plan] });
    expect(agentArtifacts({ name: 'orchestrator' }, [plan, report, other])).toEqual({ produced: [plan], received: [] });
    expect(personaArtifacts([{ name: 'coder-1' }, { name: 'tester-1' }], [plan, report, other])).toEqual([report, other]);
  });

  it('the inspector links them, states each one\'s ready flag in words, and drops the false "no artifact store" sentence', () => {
    const coder = child({});
    const s = session({ agents: [coder], artifacts: [plan, report, other] });
    const opened: string[] = [];
    const html = inspector(s, coder.id, null, (id) => opened.push(id));
    expect(html).not.toContain('this build has no artifact store');
    expect(linkIds(html, 'inspector-artifacts-produced')).toEqual(['art_rep00001']);
    expect(linkIds(html, 'inspector-artifacts-received')).toEqual(['art_plan0001']);
    expect(html).toMatch(/data-artifact-id="art_rep00001" data-ready="0"[\s\S]*?>coder-1-report<\/button><span class="artifact-link__state">failed<\/span>/);
    expect(html).toMatch(/data-artifact-id="art_plan0001" data-ready="1"[\s\S]*?>the-plan<\/button><span class="artifact-link__state">ready<\/span>/);
    // An agent with none says so in its own words.
    const quiet = inspector(session({ agents: [child({ id: 'bg_00000002', name: 'quiet-1' })], artifacts: [plan] }), 'bg_00000002', null);
    expect(quiet).toContain(NO_ARTIFACTS);
  });

  it('the persona window lists every instance\'s artifacts on its persona-wide card and the shown instance\'s own on its tools card', () => {
    const coder = child({});
    const s = session({ agents: [coder], artifacts: [plan, report, other] });
    const html = renderToStaticMarkup(createElement(PersonaWindow, {
      persona: 'coding-agent', session: s, rows: [], runLevel: null, declaredTools: [], selectedAgentId: coder.id, onSelectTab: () => undefined, nowIso: null, compressionThresholdPercent: 60,
      onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }), onOpenArtifact: () => undefined,
    }));
    expect(html).toMatch(/data-testid="persona-artifacts" data-count="1"/);
    expect(html).not.toContain(ARTIFACTS_EMPTY);
    expect(linkIds(html, 'persona-artifacts-links')).toEqual(['art_rep00001']);
    expect(html).toMatch(/data-testid="persona-instance-artifacts" data-produced="1" data-received="1"/);
  });

  /*
   * REQ-LIBRARY-093 (the repair of a-roots-publish-names-its-persona-as-its-author.md): a root's publish and its reads record
   * its canonical instance name, which for a persona the canonicaliser rewrites is not the entry persona the run-level agent
   * is named by — so its links read empty (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md).
   */
  /*
   * docs/defects/fixed/a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md (acceptance A22,
   * R-067): a plan cycle's root that only READ is named by the session's `plan_roots` row, so at the gate, with no run live
   * and nothing it produced, the run-level agent still has its received link. Without the root named, it has none.
   */
  it('REQ-MONITOR-044/052/069 (acceptance A22): at the plan gate, a plan cycle\'s root that only read keeps its received link through the root the session recorded', () => {
    const roots = [{ name: 'Lead Planner', canonical: 'Lead-Planner' }];
    const read = link({ id: 'art_rep00003', slug: 'coder-1-report', producer: 'coder-1', consumedBy: ['Lead-Planner'] });
    const s = session({ executionStatus: 'awaiting_plan_decision', agents: [child({})], artifacts: [read], entryRoots: roots });
    const lead = runLevelAgent(s, { persona: 'Lead Planner', model: 'm', reasoning: 'medium', tools: [] }, false)!;
    expect(agentArtifacts(lead, s.artifacts, roots)).toEqual({ produced: [], received: [read] });
    expect(linkIds(inspector(s, RUN_AGENT_ID, lead), 'inspector-artifacts-received')).toEqual(['art_rep00003']);
    // The defect's state: the root named nowhere, so the consumer `Lead-Planner` was no agent's.
    expect(agentArtifacts(lead, s.artifacts, [])).toEqual({ produced: [], received: [] });
  });

  it('REQ-LIBRARY-093: the run-level agent\'s links hold what its roots published and read under their canonical name, in the inspector and in the persona window; a child is still known by its own name', () => {
    const roots = [{ name: 'Lead Planner', canonical: 'Lead-Planner' }];
    const planned = link({ id: 'art_plan0002', slug: 'lead-plan', producer: 'Lead-Planner', consumedBy: ['coder-1'] });
    const reported = link({ id: 'art_rep00002', slug: 'coder-1-report', producer: 'coder-1', consumedBy: ['Lead-Planner'] });
    const s = session({ agents: [child({})], artifacts: [planned, reported, other], entryRoots: roots });
    const lead = runLevelAgent(s, { persona: 'Lead Planner', model: 'm', reasoning: 'medium', tools: [] }, false)!;
    expect(agentArtifacts(lead, s.artifacts, roots)).toEqual({ produced: [planned], received: [reported] });
    expect(personaArtifacts([lead], s.artifacts, roots)).toEqual([planned]);
    expect(agentArtifacts(child({}), s.artifacts, roots)).toEqual({ produced: [reported], received: [planned] });
    const html = inspector(s, RUN_AGENT_ID, lead);
    expect(linkIds(html, 'inspector-artifacts-produced')).toEqual(['art_plan0002']);
    expect(linkIds(html, 'inspector-artifacts-received')).toEqual(['art_rep00002']);
    const window = renderToStaticMarkup(createElement(PersonaWindow, {
      persona: 'Lead Planner', session: s, rows: [], runLevel: lead, declaredTools: [], selectedAgentId: RUN_AGENT_ID, onSelectTab: () => undefined, nowIso: null, compressionThresholdPercent: 60,
      onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }), onOpenArtifact: () => undefined,
    }));
    expect(linkIds(window, 'persona-artifacts-links')).toEqual(['art_plan0002']);
    expect(window).toMatch(/data-testid="persona-instance-artifacts" data-produced="1" data-received="1"/);
  });

  it('PD-ORCH-005 clause 4 with OQ-97 (REQ-MONITOR-071, REQ-MONITOR-053): a root resumed as the entry role writes under the persona it was opened as, and the run-level agent\'s window shows those rows and the inspector follows them to it', () => {
    const roots = [{ name: 'orchestrator', canonical: 'orchestrator' }];
    const s = session({ agents: [child({})], entryRoots: roots });
    const fallback = runLevelAgent(s, { persona: 'coding-agent', model: 'm', reasoning: 'medium', tools: [] }, false)!;
    const rows = [
      { index: 0, kind: 'agent', settled: true, body: 'Before the rest.', at: 'x', ts: '10:00:00', persona: 'orchestrator', name: 'orchestrator' },
      { index: 1, kind: 'tool', settled: true, body: 'grep', at: 'x', ts: '10:01:00', persona: 'coding-agent', name: 'orchestrator', toolName: 'grep', toolStatus: 'ok' },
      { index: 2, kind: 'agent', settled: true, body: 'The child.', at: 'x', ts: '10:02:00', persona: 'coding-agent', name: 'coder-1' },
    ];
    const window = renderToStaticMarkup(createElement(PersonaWindow, {
      persona: 'coding-agent', session: s, rows, runLevel: fallback, declaredTools: [], selectedAgentId: RUN_AGENT_ID, onSelectTab: () => undefined, nowIso: null, compressionThresholdPercent: 60,
      onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }),
    }));
    expect(window).toMatch(/data-testid="persona-transcript" data-rows="2"/);
    // Nothing selected: the row written before the rest is the latest one, and it is followed to the run-level agent.
    const followed = renderToStaticMarkup(createElement(Inspector, {
      session: s, rows: rows.slice(0, 1), personas: [], runLevel: fallback, selectedAgentId: null, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: true, resting: false, nowIso: null,
      onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined,
    }));
    expect(followed).toContain(`data-shown="${RUN_AGENT_ID}"`);
  });
});

describe('REQ-LIBRARY-102 / REQ-MONITOR-052 (live-run finding K1): a link deep-links to the Library with the artifact to open', () => {
  it('the artifacts tab carries the artifact, the proposals tab the proposal, and each is consumed once', () => {
    const shell = useShellState.getState();
    shell.openLibrary('artifacts', 'art_plan0001');
    expect(useShellState.getState()).toMatchObject({ activeView: 'library', libraryTab: 'artifacts', libraryArtifactId: 'art_plan0001', libraryProposalId: null });
    useShellState.getState().takeLibraryArtifactId();
    expect(useShellState.getState().libraryArtifactId).toBeNull();
    useShellState.getState().openLibrary('proposals', 'p-1');
    expect(useShellState.getState()).toMatchObject({ libraryTab: 'proposals', libraryProposalId: 'p-1', libraryArtifactId: null });
    useShellState.getState().takeLibraryProposalId();
  });
});

/**
 * Acceptance A36 (R-067): for the run-level agent the inspector's ring caption stated the entry role's prompt reading and,
 * one line under it, "The record does not carry the run-level agent's prompt reading in this build." The record has carried
 * it since Part AH (`SessionRecord.entryContext`). REQ-MONITOR-089: the synthetic root exposes the newest reading so a
 * root-level surface has a figure; REQ-MONITOR-065: the meter is that agent's own context window.
 */
describe('REQ-MONITOR-089 / REQ-MONITOR-065 (acceptance A36): the run-level agent\'s prompt reading', () => {
  it('the caption states the recorded reading and never denies that the record carries it', () => {
    const s = session({ entryContext: { used: 4_505, limit: 262_144 } });
    const root = runLevelAgent(s, entry, false)!;
    expect(root.contextUsed).toBe(4_505);
    const html = inspector(s, RUN_AGENT_ID, root);
    expect(html).toContain(`This agent&#x27;s own context window: ${(4_505).toLocaleString()} of ${(262_144).toLocaleString()} tokens.`);
    expect(html).not.toContain('does not carry');
    expect(html).not.toContain('prompt reading in this build');
  });
});
