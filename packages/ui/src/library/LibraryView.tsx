import { useId, useState, type ReactNode } from 'react';
import { LIBRARY_TABS } from '@rotaris/contracts';
import { useShellState } from '../shell-state.js';
import { Button as DesignButton, Input as DesignInput, PageHeader as DesignPageHeader } from '../design-system/index.js';

/**
 * REQ-SHELL-023's sixth primary view, and Part X's half of it: the page title, the one search field and the
 * three tabs. Structure from the specification — REQ-LIBRARY-102 (the view, its label, the deep link),
 * REQ-LIBRARY-103 (the title, the field's placeholder and accessible name, live filtering, the three tabs in
 * order, addressed by stable name, an unknown name ignored) and REQ-LIBRARY-104 (case-insensitive substring
 * matching, one query across all three tabs). Language from docs/design/system: page header, Tabs, Card; every
 * value a token.
 *
 * The three tab BODIES arrive as nodes, and the query is the CALLER's state rather than this component's. That
 * is deliberate and it is what REQ-LIBRARY-105 asks for: "Updates MUST NOT disturb work in progress: text being
 * typed in the search field is never cleared or reordered." A refresh replaces the tabs' data, and the query
 * sits above the refresh where nothing the refresh does can reach it. The field itself is still the Library's,
 * as REQ-LIBRARY-103 requires — it is drawn here and nowhere else, and the tabs never draw one of their own.
 *
 * This file is also the seam between the Library's parts: it owns the shell, `PromptsTab` is Part X's and
 * `ArtifactsTab` is Part Y's, each built against `LibraryTabProps`, and the Proposals tab will be a third built the
 * same way. NO tab appears in this file by name — that is what lets a tab be built and merged without touching it.
 */
export const LIBRARY_TITLE = 'Library';
export const LIBRARY_SEARCH_PLACEHOLDER = 'Search prompts, artifacts, and proposals…';
export const LIBRARY_SEARCH_NAME = 'Search Library';

export type LibraryTab = (typeof LIBRARY_TABS)[number];

/** REQ-LIBRARY-103's three labels, keyed by the stable names that requirement closes the set to. */
export const LIBRARY_TAB_LABELS: Readonly<Record<LibraryTab, string>> = { prompts: 'Prompts', artifacts: 'Artifacts', proposals: 'Improvement proposals' };

/** REQ-LIBRARY-103: tabs are addressed by stable name; activating an unknown name is ignored. */
export function isLibraryTab(name: string): name is LibraryTab {
  return (LIBRARY_TABS as readonly string[]).includes(name);
}

/** The shell folds the query ONCE and hands it down already lower-cased (`LibraryTabProps.query`). */
export function foldLibraryQuery(query: string): string {
  return query.toLowerCase();
}

/**
 * REQ-LIBRARY-104: case-insensitive substring matching over the fields the requirement lists for that kind of
 * row. The query arrives folded, so the fold happens once per keystroke rather than once per row. An empty
 * query matches everything, which is what a field that live-filters shows before anything is typed.
 */
export function matchesQuery(query: string, ...fields: readonly (string | null | undefined)[]): boolean {
  if (query === '') return true;
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(query));
}

export interface LibraryViewProps {
  /** The raw text in the field, held by the caller so no refresh can clear it (REQ-LIBRARY-105). */
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly prompts: ReactNode;
  readonly artifacts: ReactNode;
  readonly proposals: ReactNode;
}

export function LibraryView({ query, onQuery, prompts, artifacts, proposals }: LibraryViewProps) {
  const searchId = useId();
  const [chosen, setChosen] = useState<LibraryTab>('prompts');
  // A tab a notice action asked for (REQ-SHELL-115, REQ-LIBRARY-102) selects itself until the user picks another —
  // the same shape the Settings view uses for REQ-NOTIFY-223's category: derived during render, no effect, no cascade.
  const wanted = useShellState((s) => s.libraryTab);
  const take = useShellState((s) => s.takeLibraryTab);
  const active: LibraryTab = wanted !== null && isLibraryTab(wanted) ? wanted : chosen;
  const choose = (tab: LibraryTab) => { take(); setChosen(tab); };
  const bodies: Readonly<Record<LibraryTab, ReactNode>> = { prompts, artifacts, proposals };

  return (
    <div className="library" data-testid="library" data-tab={active}>
      <DesignPageHeader className="library__header page-header">
        <h1 className="display library__title">{LIBRARY_TITLE}</h1>
        <span className="library__spacer" />
        <div className="field library__search">
          <label className="visually-hidden" htmlFor={searchId}>{LIBRARY_SEARCH_NAME}</label>
          <DesignInput
            id={searchId}
            className="input"
            type="search"
            aria-label={LIBRARY_SEARCH_NAME}
            placeholder={LIBRARY_SEARCH_PLACEHOLDER}
            data-testid="library-search"
            value={query}
            onChange={(event) => onQuery(event.currentTarget.value)}
          />
        </div>
      </DesignPageHeader>
      <div className="tabs library__tabs" role="tablist" aria-label="Library sections">
        {LIBRARY_TABS.map((tab) => (
          <DesignButton
            key={tab}
            type="button"
            role="tab"
            className={`tab${active === tab ? ' is-active' : ''}`}
            aria-selected={active === tab}
            data-tab={tab}
            data-testid="library-tab"
            onClick={() => choose(tab)}
          >{LIBRARY_TAB_LABELS[tab]}</DesignButton>
        ))}
      </div>
      <div className="library__body" data-testid="library-body">{bodies[active]}</div>
    </div>
  );
}
