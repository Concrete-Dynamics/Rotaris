import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PUBLIC_TOOL_NAMES, type TranscriptRow } from '@rotaris/contracts';
import { describeToolCall, TOOL_DESCRIPTION_MAX } from './tool-description.js';
import { Row, TranscriptSurfaceProvider, type TranscriptSurface } from './Row.js';

/**
 * REQ-CHAT-175..178 — the derived description a tool row draws as its header.
 *
 * The examples are the ones the request names: `Runs npm test`, `Reads src/app.ts`, `Searches for release.yml`.
 */

const toolRow = (over: Partial<TranscriptRow> = {}): TranscriptRow => ({
  index: 1, kind: 'tool', settled: true, body: 'read_file', at: '2026-10-24T09:00:00.000Z', ts: '09:00:00',
  name: 'helper', persona: 'coding-agent', toolName: 'read_file', toolStatus: 'ok', callKey: 'c1',
  durationMs: 3_200, startedAt: '2026-10-24T09:00:00.000Z', input: '{ "path": "src/app.ts" }', ...over,
});

const surface = (over: Partial<TranscriptSurface> = {}): TranscriptSurface => ({
  showReasoning: false, autoCollapseTools: false, runActive: true, nowMs: 0, ...over,
});

const headerOf = (row: TranscriptRow, over: Partial<TranscriptSurface> = {}): string =>
  renderToStaticMarkup(
    createElement(TranscriptSurfaceProvider, {
      value: surface(over),
      children: createElement(Row, { display: { shape: 'row', key: 'k1', row }, expanded: false, onToggle: () => {}, match: null }),
    }),
  );

describe('REQ-CHAT-175 — the description is derived from the tool and its arguments', () => {
  it('says what the call does, in the words the request names', () => {
    expect(describeToolCall('terminal', '{"command":"npm test"}')).toBe('Runs npm test');
    expect(describeToolCall('read_file', '{"path":"src/app.ts"}')).toBe('Reads src/app.ts');
    expect(describeToolCall('read_file', '{"file_path":"src/app.ts"}')).toBe('Reads src/app.ts');
    expect(describeToolCall('grep', '{"pattern":"release.yml"}')).toBe('Searches for release.yml');
    expect(describeToolCall('grep', '{"pattern":"release.yml","path":"src"}')).toBe('Searches for release.yml in src');
  });

  it('reads the operation a write names, and the target it names with it', () => {
    expect(describeToolCall('write_file', '{"operation":"create","path":"src/todos.js"}')).toBe('Creates src/todos.js');
    expect(describeToolCall('write_file', '{"operation":"edit","path":"src/todos.js"}')).toBe('Edits src/todos.js');
    expect(describeToolCall('write_file', '{"operation":"overwrite","path":"src/todos.js"}')).toBe('Overwrites src/todos.js');
    expect(describeToolCall('write_file', '{"operation":"insert","path":"src/todos.js"}')).toBe('Inserts into src/todos.js');
    expect(describeToolCall('write_file', '{"operation":"undo","path":"src/todos.js"}')).toBe('Undoes the last write');
    expect(describeToolCall('haet_edit', '{"path":"src/App.jsx"}')).toBe('Edits src/App.jsx');
  });

  it('counts what a delegating or questioning call carries', () => {
    expect(describeToolCall('delegate', '{"persona":"codebase-analyst","task_name":"Map the store"}')).toBe('Delegates to codebase-analyst: Map the store');
    expect(describeToolCall('wait_for_tasks', '{"task_ids":["a","b"]}')).toBe('Waits for 2 children');
    expect(describeToolCall('ask_questions', '{"steps":[{"title":"One"},{"title":"Two"}]}')).toBe('Asks 2 questions');
  });

  it('falls back to the tool name for a tool it derives nothing for, and to the empty string for no tool at all', () => {
    expect(describeToolCall('mcp__code_intelligence__rename_symbol', '{"symbol":"remaining"}')).toBe('mcp__code_intelligence__rename_symbol');
    expect(describeToolCall('finish', '')).toBe('finish');
    expect(describeToolCall('', '{"command":"npm test"}')).toBe('');
  });

  it('falls back to the tool name when the arguments say nothing usable, never to an empty line', () => {
    expect(describeToolCall('terminal', '')).toBe('Runs a command');
    expect(describeToolCall('terminal', 'not json at all')).toBe('Runs a command');
    expect(describeToolCall('terminal', '["npm","test"]')).toBe('Runs a command');
    expect(describeToolCall('read_file', '{"path":"   "}')).toBe('Reads a file');
  });

  it('answers every tool this build ships, so no row can be drawn with no header at all', () => {
    for (const name of PUBLIC_TOOL_NAMES) expect(describeToolCall(name, '{}'), name).not.toBe('');
  });

  it('is deterministic and pure: the same two facts give the same line, twice', () => {
    const input = '{"command":"npm test"}';
    expect(describeToolCall('terminal', input)).toBe(describeToolCall('terminal', input));
  });
});

describe('REQ-CHAT-176 — the arguments are redacted exactly as the row\'s output is', () => {
  it('masks a bearer token and a secret-looking flag before the line is drawn', () => {
    const bearer = describeToolCall('terminal', '{"command":"curl -H \'Authorization: Bearer sk-live-abc123\' https://example.test"}');
    expect(bearer).not.toContain('sk-live-abc123');
    expect(bearer).toContain('***');
    const flag = describeToolCall('terminal', '{"command":"deploy --token hunter2 --verbose"}');
    expect(flag).not.toContain('hunter2');
    expect(flag).toContain('--token ***');
  });

  it('masks a credential in an argument that is not a command', () => {
    const url = describeToolCall('fetch', '{"url":"https://user:sup3rs3cret@example.test/x"}');
    expect(url).not.toContain('sup3rs3cret');
    expect(url).toContain('***');
  });

  it('masks before it clips, so a cut line cannot carry what the mask would have removed', () => {
    // The secret sits inside the first 120 characters, the cut lands after them: were the clip taken first, the mask
    // would never see it.
    const line = describeToolCall('terminal', JSON.stringify({ command: `deploy --token hunter2 ${'a'.repeat(400)}` }));
    expect(line).toContain('--token ***');
    expect(line).not.toContain('hunter2');
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('REQ-CHAT-177 — one line, drawn as the header at every stop of the slider', () => {
  it('draws the description as the header, not the tool\'s name', () => {
    const html = headerOf(toolRow());
    expect(html).toContain('Reads src/app.ts');
    expect(html).not.toContain('>read_file<');
  });

  it('keeps the header the description under every combination of the two display mechanisms the slider orders', () => {
    // PD-CHAT-010's five stops are ordered combinations of grouping and auto-collapse (Compact, Brief, Standard,
    // Detailed, Expanded). Neither mechanism may take the description away, so the header is the description in each
    // combination the build can draw today — and the derivation is unconditional, so the two ends add no rule of
    // their own that could hide it.
    for (const autoCollapseTools of [false, true]) {
      for (const runActive of [false, true]) {
        const html = headerOf(toolRow(), { autoCollapseTools, runActive });
        expect(html, `autoCollapseTools=${String(autoCollapseTools)} runActive=${String(runActive)}`).toContain('Reads src/app.ts');
      }
    }
  });

  it('keeps the outcome on the same line as the description', () => {
    const html = headerOf(toolRow());
    expect(html).toContain('ok · 3.2s');
    expect(html.indexOf('Reads src/app.ts')).toBeLessThan(html.indexOf('ok · 3.2s'));
  });

  it('never draws an empty header for a tool it knows nothing about', () => {
    const html = headerOf(toolRow({ toolName: 'mcp__server__thing', body: 'mcp__server__thing', input: '{}' }));
    expect(html).toContain('mcp__server__thing');
  });

  it('collapses a multi-line command to one line', () => {
    const line = describeToolCall('terminal', JSON.stringify({ command: 'echo one\necho two\n  echo three' }));
    expect(line).toBe('Runs echo one echo two echo three');
  });

  it('cuts a long line at the declared limit, marking it', () => {
    const line = describeToolCall('terminal', JSON.stringify({ command: 'x'.repeat(400) }));
    expect(Array.from(line)).toHaveLength(TOOL_DESCRIPTION_MAX + 1);
    expect(line.endsWith('…')).toBe(true);
  });
});

describe('REQ-CHAT-178 — the description is the header\'s accessible name', () => {
  it('is the first text of the header the row draws', () => {
    const html = headerOf(toolRow());
    const header = /<button[^>]*data-testid="tool-header"[^>]*>(.*?)<\/button>/s.exec(html)?.[1] ?? '';
    // The chevron is decorative (`aria-hidden`), so the first text a reader meets is the description itself.
    expect(header).toContain('aria-hidden="true"');
    expect(header.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().startsWith('▸ Reads src/app.ts')).toBe(true);
  });
});
