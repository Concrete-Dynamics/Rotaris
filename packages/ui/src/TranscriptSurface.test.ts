import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type AgentRecord } from '@rotaris/contracts';
import { scopeDetail } from './TranscriptSurface.js';

const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: 'quick', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: null, toolCalls: 2, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file', 'grep'], calledTools: ['grep'], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, ...over,
});

describe('TranscriptSurface — PD-ORCH-005 clause 13 (revision 4): "This task" shows no elapsed time for a paused agent (REQ-CHAT-069, OQ-100)', () => {
  it('a paused agent — in REQ-CHAT-008\'s recovery state the clock still ticks — reads its state alone; a live or ended one keeps its time', () => {
    const later = '2026-09-05T10:03:12.000Z';
    expect(scopeDetail(agent({ state: 'paused', presentationState: 'paused', live: false }), later)).toBe('paused');
    expect(scopeDetail(agent({}), later)).toBe('running · 3m 12s');
    expect(scopeDetail(agent({ state: 'succeeded', presentationState: 'done', live: false, completedAt: '2026-09-05T10:00:30.000Z' }), later)).toBe('done · 30s');
  });

  it('only a paused agent loses its time: a waiting or a queued one — not `live`, which is running only — keeps it (REQ-CHAT-069, REQ-MONITOR-111)', () => {
    const later = '2026-09-05T10:01:03.000Z';
    expect(scopeDetail(agent({ state: 'waiting_on_dependencies', presentationState: 'waiting', live: false }), later)).toBe('waiting · 1m 3s');
    expect(scopeDetail(agent({ state: 'queued', presentationState: 'queued', live: false }), later)).toBe('queued · 1m 3s');
  });
});
