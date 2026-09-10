import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BoardCard, BoardProjection } from '@rotaris/contracts';
import { RequirementsView, type RequirementsViewProps } from './RequirementsView.js';

const card: BoardCard = {
  id: 'REQ-100',
  title: 'Show the requirements board',
  column: 'ready',
  health: 'healthy',
  lifecycle: 'approved',
  kind: 'product',
  priority: 'High',
  sourcePath: 'docs/requirements/REQ-100.md',
  sourceKey: 'product',
  evidence: { sites: [] },
  alerts: [],
  relations: [],
  facts: [{ label: 'Units', value: '0' }],
};

const board: BoardProjection = {
  workspace: 'D:/work',
  generation: 4,
  producedAt: '2026-09-10T08:00:00.000Z',
  source: { kind: 'store', dir: 'docs/requirements', writable: true, canCreate: true },
  cards: [card],
  epics: [],
  queue: { entries: [], automatic: false, concurrency: 2, stopped: false },
  blocked: [],
  analysisEnabled: true,
  parseErrors: [],
};

const detail = async () => ({ ok: false as const, reason: 'unused during server rendering' });
const render = (props: Partial<RequirementsViewProps>) => renderToStaticMarkup(createElement(RequirementsView, {
  workspaceRoot: 'D:/work', board, loading: false, error: null, onRefresh: () => undefined, onOpenRequirement: detail, ...props,
}));

describe('RequirementsView', () => {
  it('draws the fourth primary view from the immutable board projection', () => {
    const html = render({});
    expect(html).toContain('data-testid="requirements-view"');
    expect(html).toContain('REQ-100');
    expect(html).toContain('Show the requirements board');
    expect(html).toContain('1 of 1 requirements · generation 4');
    expect(html).toContain('Source · docs/requirements');
    expect(html).toContain('aria-label="Requirements board"');
  });

  it('states the workspace prerequisite in the primary view', () => {
    const html = render({ workspaceRoot: '(no workspace)', board: null });
    expect(html).toContain('Open a workspace to read its requirements.');
    expect(html).toContain('The board follows the workspace shown in the title bar.');
  });
});
