import { describe, expect, it } from 'vitest';
import type { ArtifactRowPayload } from '@rotaris/contracts';
import { artifactMatches, statusCell } from './ArtifactsTab.js';
import { metadataLine } from './ArtifactInspector.js';

const row = (over: Partial<ArtifactRowPayload> = {}): ArtifactRowPayload => ({
  id: 'art_ABCDEFGH', slug: 'the-plan', title: 'The Plan', kind: 'agent_published', status: 'published',
  persona: 'planner', producer: 'planner-1', summary: 'a summary', createdAt: '2026-09-07T00:00:00.000Z',
  createdLabel: 'just now', edited: false, tags: ['planning'], importance: 'normal', supersededBy: null, ...over,
});

describe('ui/library — the Artifacts tab (REQ-LIBRARY-104, REQ-LIBRARY-108)', () => {
  it('REQ-LIBRARY-104: search is case-insensitive substring matching over title + producer + persona + kind + status', () => {
    expect(artifactMatches(row(), '')).toBe(true);
    expect(artifactMatches(row(), 'plan')).toBe(true);        // title
    expect(artifactMatches(row(), 'planner-1')).toBe(true);   // producer
    expect(artifactMatches(row(), 'planner')).toBe(true);     // persona
    expect(artifactMatches(row(), 'agent_published')).toBe(true); // kind
    expect(artifactMatches(row(), 'published')).toBe(true);   // status
    expect(artifactMatches(row(), 'a summary')).toBe(false);  // the summary is NOT part of the searched text
    expect(artifactMatches(row(), 'nothing')).toBe(false);
  });

  it('REQ-LIBRARY-108: the status cell appends ` · edited` for a hand-edited record and nothing otherwise', () => {
    expect(statusCell(row())).toBe('published');
    expect(statusCell(row({ edited: true }))).toBe('published · edited');
  });

  it('REQ-LIBRARY-131: the metadata line is `<id> · <kind> · <status>[ · by <producer-or-persona>][ · edited]`', () => {
    expect(metadataLine({ id: 'art_A', artifactKind: 'agent_published', status: 'published', producer: 'planner-1', persona: 'planner', edited: false }))
      .toBe('art_A · agent_published · published · by planner-1');
    expect(metadataLine({ id: 'art_A', artifactKind: 'child_report', status: 'failed', producer: '', persona: 'tester', edited: true }))
      .toBe('art_A · child_report · failed · by tester · edited');
    expect(metadataLine({ id: 'art_A', artifactKind: 'system', status: 'succeeded', producer: '', persona: '', edited: false }))
      .toBe('art_A · system · succeeded');
  });
});
