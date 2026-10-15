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

  /**
   * The unregistered `panels/` names in `text` whose OWN sentence, up to the name, carries no history mark. Until fin47 the
   * mark was looked for in the 80 characters before the name, so a mark ending the sentence before let an unmarked name in
   * the next one pass (fin46's review, accept1-18).
   */
  const unmarkedIn = (text: string): string[] => {
    const unmarked: string[] = [];
    for (const match of text.matchAll(/`(panels\/[^`\s]+)`/g)) {
      const name = match[1]!;
      if (registered.has(name)) continue;
      const head = text.slice(0, match.index);
      const ends = [...head.matchAll(/[.!?]\s+/g)];
      const last = ends.at(-1);
      const sentence = last === undefined ? head : head.slice(last.index + last[0].length);
      if (!HISTORY_MARK.test(sentence)) unmarked.push(name);
    }
    return unmarked;
  };

  it('every `panels/` name a comment gives is registered, or marked as history in its own sentence', () => {
    expect(unmarkedIn(prose)).toEqual([]);
  });

  it('a mark in the sentence before does not cover a name in the next one', () => {
    expect(unmarkedIn('Until 2026-10-14 it was otherwise. The layout lives under `panels/overview`.')).toEqual(['panels/overview']);
    expect(unmarkedIn('Until 2026-10-14 the layout lived under `panels/overview`.')).toEqual([]);
  });

  it('names the Workspace divider by its registered key', () => {
    expect(PANE_LAYOUT_PREFERENCE_KEYS).toContain('panels/workspace/state');
    expect(prose).toMatch(/Part AB adds `panels\/workspace\/state`/);
  });
});
