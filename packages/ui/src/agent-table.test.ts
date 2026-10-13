import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type AgentRecord } from '@rotaris/contracts';
import { AgentTable } from './AgentTable.js';

/**
 * REQ-MONITOR-281 / REQ-MONITOR-086 (docs/defects/fixed/the-mission-table-says-the-record-carries-no-compression-count.md):
 * the Mission view's agent table displays per-agent metrics, so each row conveys the agent's compression count, labelled
 * with its unit. The cell read `not recorded`, titled "The record carries no compression count in this build", while
 * `AgentRecord.compressions` has carried the count since Part AH.
 */
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: '', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: null, toolCalls: 3, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file'], grantRecorded: true, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, timedOut: null, ...over,
});
const table = (agents: AgentRecord[]) => renderToStaticMarkup(createElement(AgentTable, { agents, selected: null, nowIso: '2026-09-05T10:00:05.000Z', onSelect: () => undefined, onOpen: () => undefined, onPopOut: () => undefined }));
const cells = (html: string, cls: string) => [...html.matchAll(new RegExp(`<td class="agent-table__${cls}[^"]*"[^>]*>([^<]*)</td>`, 'g'))].map((m) => m[1]);
const headers = (html: string) => [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);

describe('REQ-MONITOR-281: the Mission table conveys each agent\'s compression count, labelled with its unit', () => {
  it('draws the record\'s count per agent, in its own column whose header names the unit, never "not recorded"', () => {
    const html = table([agent({ compressions: 2 }), agent({ id: 'bg_00000002', name: 'other', parentId: 'root:1', compressions: 0 }), agent({ id: 'bg_00000003', name: 'once', parentId: 'root:1', compressions: 1 })]);
    expect(cells(html, 'compressions')).toEqual(['2', '0', '1']);
    // Separately identifiable from the tool-call count (REQ-MONITOR-281): each figure in its own column, each column named.
    expect(cells(html, 'calls')).toEqual(['3', '3', '3']);
    expect(headers(html)).toEqual(expect.arrayContaining(['Tool calls', 'Compressions']));
    expect(html).not.toContain('not recorded');
    expect(html).not.toContain('carries no compression count');
  });
});

describe('REQ-MONITOR-274: the persona cell carries the whole name as its title', () => {
  // The cell is cut with an ellipsis past its bound (docs/defects/fixed/a-long-persona-name-widens-the-mission-table-past-its-card.md),
  // so the full name stays readable on hover.
  it('titles the persona cell with the persona', () => {
    const html = table([agent({ persona: 'a-very-long-configured-persona-name' })]);
    expect(html).toContain('<td class="agent-table__persona" title="a-very-long-configured-persona-name">a-very-long-configured-persona-name</td>');
  });
});
