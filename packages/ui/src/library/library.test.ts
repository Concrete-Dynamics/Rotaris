import { describe, expect, it, vi } from 'vitest';
import { LIBRARY_TABS } from '@rotaris/contracts';
import {
  applyStashLabel,
  clampPromptSplit,
  composeWithStashed,
  filterPrompts,
  foldLibraryQuery,
  HISTORY_EMPTY,
  isLibraryTab,
  LIBRARY_SEARCH_NAME,
  LIBRARY_SEARCH_PLACEHOLDER,
  LIBRARY_TAB_LABELS,
  LIBRARY_TITLE,
  matchesQuery,
  PROMPT_COLUMN_MIN,
  PROMPT_SPLITTER_NAME,
  STASH_DIALOG_EMPTY,
  STASH_DIALOG_INTRO,
  STASH_DIALOG_MIN_HEIGHT,
  STASH_DIALOG_MIN_WIDTH,
  STASH_DIALOG_TITLE,
  STASH_EMPTY,
  useShellState,
} from '../index.js';
import type { ArtifactRowPayload } from '@rotaris/contracts';
import { artifactMatches, statusCell } from './ArtifactsTab.js';
import { metadataLine } from './ArtifactInspector.js';

describe('library — the shell (REQ-LIBRARY-103, REQ-LIBRARY-104)', () => {
  it('names the three tabs in order, addressed by stable name, and ignores an unknown one', () => {
    expect([...LIBRARY_TABS]).toEqual(['prompts', 'artifacts', 'proposals']);
    expect(LIBRARY_TABS.map((t) => LIBRARY_TAB_LABELS[t])).toEqual(['Prompts', 'Artifacts', 'Improvement proposals']);
    expect(isLibraryTab('artifacts')).toBe(true);
    expect(isLibraryTab('Artifacts')).toBe(false);
    expect(isLibraryTab('prompt')).toBe(false);
  });

  it('carries the title and the search field\'s stated placeholder and accessible name', () => {
    expect(LIBRARY_TITLE).toBe('Library');
    expect(LIBRARY_SEARCH_PLACEHOLDER).toBe('Search prompts, artifacts, and proposals…');
    expect(LIBRARY_SEARCH_NAME).toBe('Search Library');
  });

  it('matches case-insensitively as a SUBSTRING across the fields it is given', () => {
    expect(matchesQuery(foldLibraryQuery('REFACTOR'), 'Refactor the loader')).toBe(true);
    expect(matchesQuery(foldLibraryQuery('act'), 'Refactor the loader')).toBe(true);
    expect(matchesQuery(foldLibraryQuery('loader'), 'Refactor the loader')).toBe(true);
    expect(matchesQuery(foldLibraryQuery('missing'), 'Refactor the loader')).toBe(false);
    // The same one query over several fields, which is what the Artifacts tab's row needs (title + producer + …).
    expect(matchesQuery('coding', 'a title', null, 'coding-agent', undefined, 'succeeded')).toBe(true);
    // An empty query filters nothing: a field that live-filters shows everything before anything is typed.
    expect(matchesQuery('', 'anything')).toBe(true);
  });

  it('opens a Library tab a notice action named, ignores a name outside the closed set, and consumes it once', () => {
    const s = () => useShellState.getState();
    s().switchView('overview');
    s().openLibrary('artifacts');
    expect([s().activeView, s().libraryTab]).toEqual(['library', 'artifacts']);
    s().takeLibraryTab();
    expect(s().libraryTab).toBeNull();
    // REQ-LIBRARY-103: the unknown name is ignored — the Library still opens, on whatever tab it was showing.
    s().switchView('overview');
    s().openLibrary('nonsense');
    expect([s().activeView, s().libraryTab]).toEqual(['library', null]);
    s().switchView('overview');
  });
});

describe('library — the Prompts tab (REQ-LIBRARY-106, REQ-LIBRARY-107)', () => {
  it('filters by the prompt text and keeps each row\'s ORIGINAL index, so a filtered take removes the right entry', () => {
    const stash = ['gamma', 'alpha two', 'beta', 'alpha'];
    expect(filterPrompts(stash, 'alpha')).toEqual([{ text: 'alpha two', index: 1 }, { text: 'alpha', index: 3 }]);
    // The second row on screen is index 3 in the whole list — the number a take is keyed by.
    expect(filterPrompts(stash, 'alpha')[1]?.index).toBe(3);
    expect(filterPrompts(stash, '')).toHaveLength(4);
    expect(filterPrompts([], 'anything')).toEqual([]);
  });

  it('keeps both columns at their 240 px minimum and names the splitter as the requirement does', () => {
    expect(PROMPT_COLUMN_MIN).toBe(240);
    expect(PROMPT_SPLITTER_NAME).toBe('Resize the prompt stash and history columns');
    expect(clampPromptSplit(600, 1200)).toBe(600);
    // Dragged past the right column's minimum: clamped so the right column keeps 240 px.
    expect(clampPromptSplit(1190, 1200)).toBe(1200 - 240 - 8);
    // Dragged below its own minimum, and a container too narrow for both: never below 240, never zero.
    expect(clampPromptSplit(10, 1200)).toBe(240);
    expect(clampPromptSplit(10, 300)).toBe(240);
  });

  it('states the two empty labels exactly', () => {
    expect(STASH_EMPTY).toBe('No stashed prompts.');
    expect(HISTORY_EMPTY).toBe('Prompt history is empty.');
  });
});

describe('library — the stash controls (REQ-LIBRARY-140, REQ-LIBRARY-141, REQ-CHAT-042/043/044)', () => {
  it('labels the toolbar control with its live count', () => {
    expect(applyStashLabel(0)).toBe('Apply stash (0)');
    expect(applyStashLabel(12)).toBe('Apply stash (12)');
  });

  it('states the dialog\'s title, intro, empty sentence and minimum size', () => {
    expect(STASH_DIALOG_TITLE).toBe('Prompt stash');
    expect(STASH_DIALOG_INTRO).toBe('Apply copies the selected prompt into the composer and keeps it in the stash. Pop copies it and removes it from the stash.');
    expect(STASH_DIALOG_EMPTY).toBe('No stashed prompts. Use Stash beside the composer first.');
    expect([STASH_DIALOG_MIN_WIDTH, STASH_DIALOG_MIN_HEIGHT]).toEqual([560, 360]);
  });

  it('appends after ONE blank line into a non-empty composer and replaces an empty one (REQ-CHAT-044)', () => {
    expect(composeWithStashed('', 'stashed')).toBe('stashed');
    expect(composeWithStashed('typed', 'stashed')).toBe('typed\n\nstashed');
    // Exactly one blank line is inserted; the incoming text is otherwise passed through unchanged.
    expect(composeWithStashed('typed', '\nstashed')).toBe('typed\n\n\nstashed');
    expect(composeWithStashed('a\n\nb', 'c')).toBe('a\n\nb\n\nc');
  });

  it('reaches the composer through the registration and never through the DOM (REQ-LIBRARY-107)', () => {
    const setText = vi.fn();
    const submit = vi.fn();
    useShellState.getState().registerComposer({ submit, enabled: true, setText });
    useShellState.getState().composer?.setText('a stashed prompt');
    expect(setText).toHaveBeenCalledWith('a stashed prompt');
    expect(submit).not.toHaveBeenCalled();
    useShellState.getState().registerComposer(null);
    // Unmounted: a surface that asks finds no composer and does nothing, rather than reaching for a textarea.
    expect(useShellState.getState().composer).toBeNull();
  });
});


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
