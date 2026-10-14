import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PANE_LAYOUT_PREFERENCE_KEYS } from './commands.js';

/**
 * REQ-SHELL-069 with REQ-SHELL-006's per-user preference store table: the `panels/` keys that exist are `panels/version`
 * and, per registered view, `panels/{view-key}/state` and `panels/{view-key}/panes`. A `panels/` name this file's comments
 * give otherwise is a retired one (the `panels/<view>` record of before 2026-10-14), and is kept only when the sentence
 * marks it as history — written in the present tense beside the key list, it reads as the key a layout is stored under
 * (docs/defects/fixed/the-commands-contract-comment-names-the-workspace-divider-by-its-retired-key.md).
 */
describe('commands.ts names no retired pane-layout key as current (REQ-SHELL-069)', () => {
  const registered = new Set<string>([
    'panels/version',
    'panels/{view-key}/state',
    'panels/{view-key}/panes',
    ...PANE_LAYOUT_PREFERENCE_KEYS,
    ...PANE_LAYOUT_PREFERENCE_KEYS.map((key) => key.replace(/\/state$/, '/panes')),
  ]);
  const HISTORY_MARK = /\b(until 2026-10-14|formerly|retired)\b/i;

  /** The source with each comment line's leading ` * ` folded into one space, so a sentence reads across its wrap. */
  const prose = readFileSync(new URL('./commands.ts', import.meta.url), 'utf8').replace(/\n[ \t]*\*[ \t]?/g, ' ');

  it('every `panels/` name a comment gives is registered, or marked as history in the words before it', () => {
    const unmarked: string[] = [];
    for (const match of prose.matchAll(/`(panels\/[^`\s]+)`/g)) {
      const name = match[1]!;
      if (registered.has(name)) continue;
      const before = prose.slice(Math.max(0, match.index - 80), match.index);
      if (!HISTORY_MARK.test(before)) unmarked.push(name);
    }
    expect(unmarked).toEqual([]);
  });

  it('names the Workspace divider by its registered key', () => {
    expect(PANE_LAYOUT_PREFERENCE_KEYS).toContain('panels/workspace/state');
    expect(prose).toMatch(/Part AB adds `panels\/workspace\/state`/);
  });
});
