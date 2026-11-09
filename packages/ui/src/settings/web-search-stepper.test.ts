import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type { ConfigSnapshot, McpHealth, McpListing, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import { McpSettings } from './McpSettings.js';
import type { McpSettingsProps } from './McpSettings.js';
import {
  WEB_SEARCH_ABOUT, WEB_SEARCH_ABOUT_CONTROL, WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_NOT_WRITTEN_BY_US, WEB_SEARCH_SERVER,
  WEB_SEARCH_SETUP_ROW_ACTION, WEB_SEARCH_SETUP_ROW_DESCRIPTION, WEB_SEARCH_SETUP_ROW_LABEL, WEB_SEARCH_STEPS,
  WEB_SEARCH_TAKE_EFFECT, webSearchAboutControlLabel, webSearchRowSetupVisible, webSearchStepFor, webSearchStepLabel, webSearchStepShortLabel,
} from './web-search-setup.js';
import type { WebSearchSituation, WebSearchStepId } from './web-search-setup.js';

/**
 * THE STEP BAR, THE INFO DISCLOSURE AND THE ROW'S OFFER (the stepper/inline-help change, 2026-11-09).
 *
 * The change turns the card's four loose kicker paragraphs into one bar of four named steps, moves three explanatory
 * sentences behind a single icon control, and offers the way into the card from the `web_search` row while there is
 * still something for it to do. These cases pin exactly that, and each names the one reason it can fail:
 *
 *  - the pure half (`WEB_SEARCH_STEPS`, `webSearchStepLabel`, `webSearchStepShortLabel`, `webSearchStepFor`,
 *    `webSearchRowSetupVisible`) so the labels, the current step and the row control's visibility are assertable
 *    without a window;
 *  - the rendered markup: ONE `ph ph-info` control in the head with a name and `aria-expanded`, `aria-controls` onto
 *    its region; FOUR step controls whose accessible name is `Step N · <title>` and whose visible text is `Step N`,
 *    exactly one `aria-current="step"`; every control's `aria-controls` naming an element that is actually in the
 *    markup (a dangling id is the shape of a broken disclosure); every body OPEN by default (`hidden` absent);
 *  - the row control: present for the shipped `http` default with no key, absent once a key is stored or on another
 *    transport;
 *  - the boundaries this change must NOT move: the card still writes no server, still carries one password field, and
 *    the C3/C7 rules in `shell.css` stand (`web-search-measure.test.ts` covers those numbers; the last case re-reads
 *    their presence so this file fails if the change quietly outranked them).
 *
 * The repo mounts no DOM under a test environment and `renderToStaticMarkup` reaches no event, so the three
 * PRESSES that matter here are driven the only way this repo drives them: `useState` is replaced by a cell store a
 * test can seed, and the JSX runtime records every element so a control's own handler can be called
 * (`web-search-card.test.ts`'s harness, repeated here in the smaller shape the two disclosures need).
 */
const harness = vi.hoisted(() => ({
  elements: [] as { props: Record<string, unknown> }[],
  cells: [] as { initialised: boolean; value: unknown }[],
  effects: [] as { deps: readonly unknown[] | undefined; body: () => void | (() => void) }[],
  pendingEffects: [] as { index: number; body: () => void | (() => void); previous: { deps: readonly unknown[] | undefined; body: () => void | (() => void) } | undefined }[],
  cleanups: new Map<number, () => void>(),
  cursor: 0,
}));
/** The JSX recorder, built INSIDE the hoisted block: `vi.mock`'s factory is hoisted above every `const` in this file,
 * so a top-level `record` is still in its temporal dead zone when the mocked module is first evaluated. */
const record = vi.hoisted(() => (fn: unknown) => (type: unknown, props: Record<string, unknown> | null, ...rest: unknown[]) => {
  harness.elements.push({ props: props ?? {} });
  return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
});
vi.mock('react/jsx-runtime', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, jsx: record(real['jsx']), jsxs: record(real['jsxs']) };
});
vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, jsxDEV: record(real['jsxDEV']) };
});
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof React>();
  return {
    ...real,
    useState: (init: unknown) => {
      const idx = harness.cursor;
      const cell = (harness.cells[idx] ??= { initialised: false, value: undefined });
      harness.cursor += 1;
      if (!cell.initialised) { cell.value = typeof init === 'function' ? (init as () => unknown)() : init; cell.initialised = true; }
      const set = (v: unknown) => { cell.value = typeof v === 'function' ? (v as (p: unknown) => unknown)(cell.value) : v; };
      return [cell.value, set];
    },
    /**
     * The focus route lives in an EFFECT, and `renderToStaticMarkup` runs none — so `useEffect` is replaced by one that
     * REGISTERS its body (with its deps and its cleanup) in `harness.effects`, and `runEffects()` below applies them in
     * order the way React does: every changed effect's cleanup first, then its body. Without this the focus route is
     * untestable here and an inert one would pass (`confirm-dismissal.test.ts` takes the same cut).
     */
    useEffect: (body: () => void | (() => void), deps: readonly unknown[] | undefined) => {
      const idx = harness.cursor;
      const previous = harness.effects[idx];
      harness.cursor += 1;
      harness.effects[idx] = { deps, body };
      harness.pendingEffects.push({ index: idx, body, previous });
    },
  };
});

const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: 'https://x/mcp', origin: 'default',
  enabled: true, overridden: false, available: true, availabilityDetail: '', unresolved: [], expectedKeys: [], ...over,
});
const keyRow = { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, masked: '***', scope: 'Workspace' as const };
const secrets = (rows: typeof keyRow[]): McpSecretsView => ({ servers: [WEB_SEARCH_SERVER], rows, expected: [], server: null });
const listing = (rows: McpServerRow[]): McpListing => ({ configFile: '/ws/.rotaris/agents.yaml', rows });

/**
 * The views are STABLE across the draws of one case (production replaces an object only when a read replaces it), so
 * the card's own witness of a re-read is not disturbed by this harness.
 */
let views: { listing: McpListing; secrets: McpSecretsView } | null = null;
const viewsNow = () => (views ??= { listing: listing([row()]), secrets: secrets([]) });

const props = (over: Partial<McpSettingsProps> = {}): McpSettingsProps => ({
  listing: viewsNow().listing, loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: viewsNow().secrets, webSearchSecrets: viewsNow().secrets, onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  webSearchSetup: {
    onOpenFile: async () => ({ ok: true as const }),
    onGetKey: async () => ({ ok: true as const }),
    onStoreKey: async () => ({ ok: false as const, message: 'not pressed here' }),
    onDeleteKey: async () => ({ ok: false as const, message: 'not pressed here' }),
    onProbe: async () => ({ state: 'unknown' as const }),
  },
  ...over,
});
const draw = (over: Partial<McpSettingsProps> = {}): { html: string; card: string; find: (attr: string) => Record<string, unknown> | undefined; all: (attr: string) => Record<string, unknown>[] } => {
  harness.elements.length = 0; harness.cursor = 0;
  const html = renderToStaticMarkup(createElement(McpSettings, props(over)));
  // A design-system wrapper spreads its props onto its inner element, so every marked element is captured TWICE;
  // `all` dedupes on the attribute's own value (`web-search-card.test.ts` dedupes the same way).
  const all = (attr: string) => {
    const seen = new Set<unknown>();
    const found: Record<string, unknown>[] = [];
    for (const e of harness.elements) {
      const value = e.props[attr];
      if (value === undefined || seen.has(value)) continue;
      seen.add(value);
      found.push(e.props);
    }
    return found;
  };
  // The guided card's own markup, so an assertion about THIS card is never satisfied (or broken) by a sibling's words.
  const start = html.indexOf('data-mcp-websearch-setup');
  const next = html.indexOf('data-mcp-setup', start);
  const card = start < 0 ? '' : html.slice(start, next < 0 ? undefined : next);
  return { html, card, find: (attr) => harness.elements.find((e) => e.props[attr] !== undefined)?.props, all };
};
/** React escapes `'` in text nodes; a sentence compared against the markup is compared in its escaped form. */
const escaped = (text: string): string => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
/**
 * Apply the effects the last draw registered, the way React commits them: **all** changed effects' cleanups run first
 * (the unmount/teardown phase), then their bodies (the setup phase, whose own return becomes the next cleanup).
 * Effects whose deps are unchanged are skipped, which is what makes "re-registered whenever the situation moves"
 * assertable.
 */
const runEffects = (): void => {
  const changed: { index: number; body: () => void | (() => void) }[] = [];
  for (const { index, body, previous } of harness.pendingEffects) {
    const current = harness.effects[index]!;
    const same = previous !== undefined && previous.deps !== undefined && current.deps !== undefined
      && previous.deps.length === current.deps.length
      && previous.deps.every((d, i) => Object.is(d, current.deps![i]));
    if (same) continue;
    changed.push({ index, body });
  }
  for (const { index } of changed) harness.cleanups.get(index)?.();
  for (const { index, body } of changed) {
    const returned = body();
    if (typeof returned === 'function') harness.cleanups.set(index, returned);
    else harness.cleanups.delete(index);
  }
  harness.pendingEffects.length = 0;
};
const health = (h: McpHealth): Record<string, McpHealth> => ({ [WEB_SEARCH_SERVER]: h });
describe('the step bar, the info control and the row offer — the pure half', () => {
  it('names exactly four steps, in order, each labelled `Step N · <title>` for its name and `Step N` for its visible text — fails if the numbering or the order lives anywhere but the list (FND-5, Opus 5.5 review, 2026-11-09)', () => {
    expect(WEB_SEARCH_STEPS.map((s) => s.id)).toEqual(['provider', 'declaration', 'key', 'test']);
    // `Array.map` passes (value, index), and `webSearchStepLabel` takes (index, step) — so the callback is explicit.
    expect(WEB_SEARCH_STEPS.map((step, index) => webSearchStepLabel(index, step))).toEqual([
      'Step 1 · Choose your search provider',
      'Step 2 · Put this in your configuration file',
      'Step 3 · Paste the key',
      'Step 4 · Test it',
    ]);
    // FND-5: the VISIBLE text is the number alone; the title keeps one home, the body's own heading. WCAG 2.5.3 holds:
    // the visible `Step 2` is contained in the control's name `Step 2 · …`.
    expect(WEB_SEARCH_STEPS.map((_, index) => webSearchStepShortLabel(index))).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4']);
  });

  it('lands every situation on the step that needs the user — fails if a key-side situation points at the provider step, a stored-key-but-disabled entry points at the key step instead of the enablement, or a stored key points anywhere but the test', () => {
    const expected: Readonly<Record<WebSearchSituation, ReturnType<typeof webSearchStepFor>>> = {
      unavailable: 'provider', 'no-entry': 'provider', 'other-transport': 'provider', fresh: 'provider',
      'needs-key': 'key', 'needs-enabled': 'declaration', 'needs-unresolved': 'key',
      stored: 'test', 'wrong-endpoint': 'test', ready: 'test',
    };
    for (const [situation, step] of Object.entries(expected)) {
      expect(webSearchStepFor(situation as WebSearchSituation)).toBe(step);
    }
    // F2 (PR #77 UI review, 2026-11-09): `needs-enabled` means the key is ALREADY stored and only the durable
    // enablement is left (REQ-MCP-115) — a configuration edit, which is step 2's business, not the key step's.
    expect(webSearchStepFor('needs-enabled')).toBe('declaration');
  });

  it('offers the row control exactly while it can still do something — fails if it stands with a key already stored, without a row, on another transport, for another server, or for a user-declared entry', () => {
    expect(webSearchRowSetupVisible(row(), null)).toBe(true);
    expect(webSearchRowSetupVisible(row(), keyRow)).toBe(false);
    expect(webSearchRowSetupVisible(null, null)).toBe(false);
    expect(webSearchRowSetupVisible(row({ type: 'stdio' }), null)).toBe(false);
    // The row's own NAME is part of the predicate: no other server may offer this card's way in.
    expect(webSearchRowSetupVisible(row({ name: 'browser' }), null)).toBe(false);
    // And it is the SHIPPED default the card is about — a user's own http declaration is the `needs-key` step's business.
    expect(webSearchRowSetupVisible(row({ origin: 'yaml' }), null)).toBe(false);
    expect(webSearchRowSetupVisible(row({ origin: 'discovered-user' }), null)).toBe(false);
  });

  it('the info control carries ONE name and ONE tooltip in both states, and the state has one home (`aria-expanded`) — fails if the name swaps while the tooltip stays, so a screen reader and a pointer user are told different things (FND-7, Opus 5.5 review, 2026-11-09)', () => {
    expect(webSearchAboutControlLabel(false)).toBe(WEB_SEARCH_ABOUT_CONTROL);
    // FND-7: the name no longer swaps. It used to read `Hide help about the web search setup` while `title` stayed
    // `About web search setup`, so the control carried two disagreeing strings and `aria-expanded` said the state a
    // third time. One stable pair now; OQ-503's reading of §1.7 asks for a name and a tooltip, not for a state word.
    expect(webSearchAboutControlLabel(true)).toBe(WEB_SEARCH_ABOUT_CONTROL);
    expect(WEB_SEARCH_ABOUT_CONTROL).not.toContain('Hide');
  });

  it('the about region holds exactly the three sentences that moved, word for word, and never a generic `Info` — fails if a sentence was reworded, dropped, or if the control is named by the banned noun', () => {
    expect(WEB_SEARCH_ABOUT).toHaveLength(3);
    expect(WEB_SEARCH_ABOUT).toContain(WEB_SEARCH_NOT_WRITTEN_BY_US);
    expect(WEB_SEARCH_ABOUT).toContain(WEB_SEARCH_TAKE_EFFECT);
    expect(WEB_SEARCH_ABOUT_CONTROL).not.toBe('Info');
    expect(WEB_SEARCH_ABOUT_CONTROL).toContain('web search');
  });

  it('names every icon the card draws with the one Phosphor family, never a unicode glyph — fails if `Get a key` carries `↗` again (FND-4, Opus 5.5 review, 2026-11-09)', () => {
    const { card } = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    // §1.9: Phosphor icons, "no unicode-symbol icons". The row's `Get a key` link was the one `↗` in `packages/ui/src`.
    expect(card).toContain('<i class="ph ph-arrow-square-out" aria-hidden="true"></i>');
    expect(card).not.toContain('↗');
    for (const glyph of ['→', '←', '⇧', '⇒', '•', '→']) expect(card).not.toContain(glyph);
  });

  it('the row control\'s words are the surface\'s own and its name identifies it and its server — fails if it is labelled "Add provider" or its name drops the server', () => {
    expect(WEB_SEARCH_SETUP_ROW_ACTION).toBe('Set up web search');
    expect(WEB_SEARCH_SETUP_ROW_ACTION).not.toContain('Add provider');
    expect(WEB_SEARCH_SETUP_ROW_LABEL).toContain(WEB_SEARCH_SETUP_ROW_ACTION);
    expect(WEB_SEARCH_SETUP_ROW_LABEL).toContain(WEB_SEARCH_SERVER);
    expect(WEB_SEARCH_SETUP_ROW_DESCRIPTION).toContain('step that needs you');
    // F4 (PR #77 UI review, 2026-11-09): the press only FOCUSES the current step's bar control — the card is rendered
    // unconditionally, so nothing is "opened". The description says the work (`Moves to`), not the mechanism.
    expect(WEB_SEARCH_SETUP_ROW_DESCRIPTION).not.toContain('Opens');
    expect(WEB_SEARCH_SETUP_ROW_DESCRIPTION).toMatch(/^Moves to /);
  });
});

describe('the card as it renders', () => {
  it('carries ONE named icon control in the head, whose `aria-controls` names a region that is always rendered (REQ-SHELL-144/149) — fails if the icon is decoration, unnamed, a bare chevron, or its target dangles while the region is closed', () => {
    const { html, find } = draw();
    const control = find('data-websearch-about-control');
    expect(control).toBeDefined();
    expect(control!['aria-label']).toBe(WEB_SEARCH_ABOUT_CONTROL);
    expect(control!['aria-expanded']).toBe(false);
    expect(control!['aria-controls']).toBe('websearch-about');
    // The region the control names EXISTS while closed, and it is `hidden` — a closed fold, not a dangling id.
    expect(html).toContain('id="websearch-about" data-websearch-about="true" hidden');
    expect(html).toContain('<i class="ph ph-info" aria-hidden="true"></i>');
    // No dialog, no second control of the kind.
    expect(harness.elements.filter((e) => e.props['data-websearch-about-control'] !== undefined)).toHaveLength(2);
  });

  it('the head no longer carries the loose prose: the three sentences stand in the about region alone, and the region is out of sight while closed — fails if the explanation is still dumped in front of step 1', () => {
    const { card } = draw({ listing: listing([row()]), secrets: secrets([]) });
    // Closed by default: the region is rendered `hidden`, so nothing of it reads; and none of the three sentences is
    // anywhere BUT inside that region (the old head paragraph and the old step-2/step-3 lines are gone).
    expect(card).toContain('id="websearch-about" data-websearch-about="true" hidden');
    for (const sentence of WEB_SEARCH_ABOUT) {
      expect(card.split(escaped(sentence))).toHaveLength(2);
      expect(card.indexOf(escaped(sentence))).toBeGreaterThan(card.indexOf('id="websearch-about"'));
    }
    // The card is still the card, and its first step is still offered.
    expect(card).toContain('data-mcp-websearch-setup');
    expect(card).toContain('data-websearch-presets');
  });

  it('draws FOUR step controls labelled from the one list, with exactly ONE `aria-current="step"` — fails if the bar gates nothing, misnumbers, or marks two positions', () => {
    const { html, all } = draw();
    const controls = all('data-websearch-step-control');
    expect(controls).toHaveLength(4);
    for (const [i, step] of WEB_SEARCH_STEPS.entries()) {
      expect(html).toContain(`Step ${i + 1} · ${step.title}`);
    }
    const current = controls.filter((c) => c['aria-current'] === 'step');
    expect(current).toHaveLength(1);
    // `fresh` stands at the choice (the shipped default has no key), so the current step is step 1.
    expect(current[0]!['data-websearch-step-control']).toBe('provider');
    expect(current[0]!['data-step-current']).toBe('yes');
  });

  it('every step control names the body it opens, and every body is in the markup and OPEN — fails if a disclosure dangles or a step starts withheld (nothing is gated)', () => {
    const { html, all } = draw();
    const controls = all('data-websearch-step-control');
    for (const step of WEB_SEARCH_STEPS) {
      const control = controls.find((c) => c['data-websearch-step-control'] === step.id)!;
      expect(control['aria-expanded']).toBe(true);
      expect(control['aria-controls']).toBe(`websearch-step-${step.id}`);
      // The element the control names is present, and it is NOT `hidden`: every body starts open.
      expect(html).toContain(`id="websearch-step-${step.id}"`);
      expect(html).not.toContain(`id="websearch-step-${step.id}" data-websearch-step-body="${step.id}" hidden`);
      expect(html).toContain(`data-websearch-step-body="${step.id}"`);
    }
    // The four bodies carry the four headings word for word — the old kickers are gone. FND-5 of the Opus 5.5
    // review (2026-11-09): the bar used to repeat the whole title, so each of the four stood 2x on the open card (8
    // occurrences, §1.11's "no filler"). The title now has one home, the body's own heading, and the bar carries the
    // number it must carry as TEXT (REQ-SHELL-149).
    for (const step of WEB_SEARCH_STEPS) expect(html).toContain(`>${step.title}<`);
    expect(html.match(/>Choose your search provider</g)).toHaveLength(1);
    // The bar's visible words are the numbers; the full `Step N · <title>` is the control's accessible NAME.
    for (let i = 0; i < WEB_SEARCH_STEPS.length; i += 1) expect(html).toContain(`>Step ${i + 1}<`);
    expect(html).not.toContain(`>Step ${WEB_SEARCH_STEPS.length + 1}<`);
  });

  it('keeps the four bodies apart, in order, so a control can withhold only its own — fails if the bodies are nested (a fold inside a fold) or reordered', () => {
    const { html } = draw();
    const order = WEB_SEARCH_STEPS.map((s) => html.indexOf(`data-websearch-step-body="${s.id}"`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // No body opens inside another: the bar is a sibling of the bodies, and the bodies share one parent.
    const firstBody = html.indexOf('data-websearch-step-body="provider"');
    const bar = html.indexOf('data-websearch-step-bar');
    expect(bar).toBeLessThan(firstBody);
  });

  it('the two step lists on the view do NOT share an accessible name — the code-intelligence setup list keeps "Setup steps", this card\'s bar names itself — fails if a screen reader hears two identically named lists (F3, PR #77 UI review, 2026-11-09)', () => {
    const setup = {
      provisioning: { store: '/home/u/.rotaris/runtime', servers: [] }, state: 'finished' as const,
      steps: [{ id: 'create' as const, label: 'Create the project', status: 'succeeded' as const, detail: '', elapsedMs: 10 }],
      outcome: 'completed' as const, message: '', containsCode: true, invocation: 'code-intel', startedAt: null, applicable: true,
    };
    // Both lists stand at once: the SetupCard renders unconditionally, the bar renders unless the situation is
    // `no-entry`/`unavailable` (REQ-MCP-112's list beside REQ-MCP-111's bar).
    const { html } = draw({ listing: listing([row()]), webSearchSecrets: secrets([]), setup });
    expect(html).toContain('data-setup-steps');
    expect(html).toContain('data-websearch-step-bar');
    // The old label "Setup steps" belongs to the code-intelligence list alone; the bar carries its own, distinct name.
    expect(html.match(/aria-label="Setup steps"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Web search setup steps"');
  });

  it('a step control closes and reopens exactly its own body (driven press) — fails if the state is shared between steps or never moves', () => {
    harness.cells.length = 0; harness.cursor = 0; views = null;
    const first = draw();
    const step2 = first.all('data-websearch-step-control').find((c) => c['data-websearch-step-control'] === 'declaration')!;
    (step2['onClick'] as () => void)();
    const second = draw();
    const controls = second.all('data-websearch-step-control');
    expect(controls.find((c) => c['data-websearch-step-control'] === 'declaration')!['aria-expanded']).toBe(false);
    expect(second.html).toContain('id="websearch-step-declaration" data-websearch-step-body="declaration" hidden');
    // Its neighbours are untouched.
    expect(controls.find((c) => c['data-websearch-step-control'] === 'key')!['aria-expanded']).toBe(true);
    expect(second.html).not.toContain('id="websearch-step-key" data-websearch-step-body="key" hidden');
    // And the same press reopens it.
    const reopen = second.all('data-websearch-step-control').find((c) => c['data-websearch-step-control'] === 'declaration')!;
    (reopen['onClick'] as () => void)();
    expect(draw().all('data-websearch-step-control').find((c) => c['data-websearch-step-control'] === 'declaration')!['aria-expanded']).toBe(true);
  });

  it('the info control opens the region with the three sentences (driven press) — fails if the press only flips a label', () => {
    harness.cells.length = 0; harness.cursor = 0; views = null;
    const first = draw();
    (first.find('data-websearch-about-control')!['onClick'] as () => void)();
    const second = draw({ listing: listing([row()]), secrets: secrets([]) });
    expect(second.html).toContain('id="websearch-about" data-websearch-about="true">');
    expect(second.html).toContain(escaped(WEB_SEARCH_NOT_WRITTEN_BY_US));
    expect(second.html).toContain(escaped(WEB_SEARCH_TAKE_EFFECT));
    expect(second.find('data-websearch-about-control')!['aria-expanded']).toBe(true);
    // FND-7: the name stays the one constant while open; the state is carried by `aria-expanded` above alone.
    expect(second.find('data-websearch-about-control')!['aria-label']).toBe(WEB_SEARCH_ABOUT_CONTROL);
    expect(second.find('data-websearch-about-control')!['title']).toBe(WEB_SEARCH_ABOUT_CONTROL);
    // Every sentence of the region is bounded by the card's prose rule (the region is C7's business like the rest).
    const at = second.html.indexOf('<div id="websearch-about"');
    const region = second.html.slice(at, second.html.indexOf('</div>', at));
    expect(region).toContain('text-secondary settings__hint');
  });

  it('marks the step each situation needs, and moves the mark with the situation — fails if the bar always points at step 1', () => {
    const at = (over: Partial<McpSettingsProps>): string =>
      String(draw(over).all('data-websearch-step-control').find((c) => c['aria-current'] === 'step')!['data-websearch-step-control']);
    expect(at({ listing: listing([row()]), webSearchSecrets: secrets([]) })).toBe('provider');
    expect(at({ listing: listing([row({ origin: 'yaml', unresolved: [WEB_SEARCH_KEY_VARIABLE] })]), webSearchSecrets: secrets([]) })).toBe('key');
    // F2: a stored key on an entry the file holds disabled needs the ENABLEMENT, so the bar marks step 2, not step 3.
    expect(at({ listing: listing([row({ enabled: false })]), webSearchSecrets: secrets([keyRow]) })).toBe('declaration');
    expect(at({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]) })).toBe('test');
    expect(at({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]), health: health({ state: 'unreachable', detail: 'connect ECONNREFUSED' }) })).toBe('test');
  });

  it('the finished card keeps its existing collapse: steps 1–3 give way to the summary and the bar with them, while the test step stays offered and OPEN — fails if the bar survives over the summary or the test step is withheld', () => {
    const { html, card } = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]), health: health({ state: 'healthy', toolCount: 2 }) });
    expect(html).toContain('data-websearch-situation="ready"');
    expect(card).toContain('data-websearch-summary');
    // The bar belongs to the steps the summary replaces, so it is not drawn beside it.
    expect(card).not.toContain('data-websearch-step-bar');
    // Step 4 is outside the collapse (the design brief §4) — its body is there, open, with its control.
    expect(card).toContain('data-websearch-step-body="test"');
    expect(card).not.toContain('data-websearch-step-body="test" hidden');
    expect(card).toContain('data-websearch-check');
  });

  it('a step-4 body the user closed while the bar stood is FORCED open once the bar is gone (the `ready` collapse) — fails if a closed fold is stranded with no opener', () => {
    harness.cells.length = 0; harness.cursor = 0; views = null;
    // `stored` (bar drawn): close step 4.
    const first = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]) });
    const testStep = first.all('data-websearch-step-control').find((c) => c['data-websearch-step-control'] === 'test')!;
    (testStep['onClick'] as () => void)();
    const closed = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]) });
    expect(closed.card).toContain('data-websearch-step-body="test" hidden');
    // The category's probe now reports Healthy: the situation is `ready`, the bar disappears — and the test step is open.
    const ready = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]), health: health({ state: 'healthy', toolCount: 2 }) });
    expect(ready.html).toContain('data-websearch-situation="ready"');
    expect(ready.card).toContain('data-websearch-summary');
    expect(ready.card).toContain('data-websearch-step-body="test"');
    expect(ready.card).not.toContain('data-websearch-step-body="test" hidden');
    expect(ready.card).toContain('data-websearch-check');
  });

  it('offers the way into the card on the `web_search` row alone, while no key is stored — fails if the row never offers it, offers it with a key already stored, or offers it from a neighbouring server\'s row', () => {
    const offered = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    const control = offered.find('data-websearch-row-setup');
    expect(control).toBeDefined();
    expect(control!['aria-label']).toBe(WEB_SEARCH_SETUP_ROW_LABEL);
    expect(control!['aria-description']).toBe(WEB_SEARCH_SETUP_ROW_DESCRIPTION);
    expect(offered.html).toContain(`>${WEB_SEARCH_SETUP_ROW_ACTION}<`);

    const keyed = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]) });
    expect(keyed.html).not.toContain('data-websearch-row-setup');

    const otherTransport = draw({ listing: listing([row({ type: 'stdio', line: 'npx -y something' })]), webSearchSecrets: null });
    expect(otherTransport.html).not.toContain('data-websearch-row-setup');

    const noRow = draw({ listing: listing([row({ name: 'browser', type: 'stdio' })]), webSearchSecrets: null });
    expect(noRow.html).not.toContain('data-websearch-row-setup');
  });

  it('a NEIGHBOURING server is never given this card\'s way in, and a user-declared http entry does not stand in for the shipped default — fails if one row value is shared across the table', () => {
    // Fresh cells: `Row` runs before the card and each row takes two, so a stale store from an earlier test would
    // misalign the card's own states (the index-keyed store the repo's card tests use).
    harness.cells.length = 0; harness.cursor = 0; views = null;
    // Two rows: the shipped web_search default (which may offer) and an unrelated server beside it (which may not).
    const { html } = draw({ listing: listing([row(), row({ name: 'browser', type: 'stdio', line: 'npx -y something', origin: 'default' })]), webSearchSecrets: secrets([]) });
    expect(html).toContain('data-mcp-server="browser"');
    // Exactly one row carries the offer: the `web_search` row. Read it out of the markup, row by row.
    const rows = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
    const chunks = rows.split('<tr ').slice(1);
    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      const isWebSearch = chunk.includes('data-mcp-server="web_search"');
      expect(chunk.includes('data-websearch-row-setup')).toBe(isWebSearch);
    }

    // The same shipped-default shape declared by the user instead of shipped: no offer.
    harness.cells.length = 0; harness.cursor = 0;
    const declared = draw({ listing: listing([row({ origin: 'yaml' })]), webSearchSecrets: secrets([]) });
    expect(declared.html).not.toContain('data-websearch-row-setup');
  });

  it('the row\'s press reaches the card\'s own focus route and lands on the CURRENT step, and an inert route cannot pass — fails if the press goes nowhere', () => {
    harness.cells.length = 0; harness.cursor = 0; harness.effects.length = 0; harness.cleanups.clear(); harness.pendingEffects.length = 0; views = null;
    const focused: WebSearchStepId[] = [];

    // `McpSettings` owns the route (`setupFocus` → its own callback → the card's effect), so the press is driven the
    // way the product drives it: the row control's own handler, after the card's effect has been committed.
    harness.cursor = 0;
    const first = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    harness.cursor = 0;
    runEffects();

    // The refs the render filled: a stub stands in for the DOM node a static render never makes. With no body
    // recorded the route falls back to the bar control, which is the one thing the route may always land on.
    for (const control of first.all('data-websearch-step-control')) {
      const id = control['data-websearch-step-control'] as WebSearchStepId;
      (control['ref'] as ((el: unknown) => void) | undefined)?.({ focus: () => focused.push(id) });
    }
    for (const body of first.all('data-websearch-step-body')) {
      const id = body['data-websearch-step-body'] as WebSearchStepId;
      (body['ref'] as ((el: unknown) => void) | undefined)?.({ id, hidden: false, querySelector: (sel: string) => (id === 'provider' && sel.startsWith('button') ? { focus: () => focused.push(`in:${id}`) } : null) });
    }
    (first.find('data-websearch-row-setup')!['onClick'] as () => void)();
    // FND-1 (Opus 5.5 review, 2026-11-09): the press lands on the step's OWN first control, `in:provider` — NOT on the
    // bar control, whose next Enter/Space would close the very body the user was sent to. The bar control is the
    // fallback only (asserted by the stub-less case above).
    expect(focused).toEqual(['in:provider']);
  });

  it('a step body the user had CLOSED is opened by the press, and focus lands inside it afterwards — fails if the route focuses through a fold or lands on the fold\'s own toggle (FND-1)', () => {
    harness.cells.length = 0; harness.cursor = 0; harness.effects.length = 0; harness.cleanups.clear(); harness.pendingEffects.length = 0; views = null;
    const focused: string[] = [];
    // `fresh` (no key stored) is the situation the row's offer stands in, and its current step is `provider`: close
    // exactly that body, so the only way the press can land is by reopening it.
    const first = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    const providerStep = first.all('data-websearch-step-control').find((c) => c['data-websearch-step-control'] === 'provider')!;
    (providerStep['onClick'] as () => void)();

    harness.cursor = 0;
    const second = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    expect(second.card).toContain('data-websearch-step-body="provider" hidden');
    expect(second.find('data-websearch-row-setup')).toBeDefined();
    harness.cursor = 0;
    runEffects();

    let bodyHidden = true;
    const stubRefs = (drawn: ReturnType<typeof draw>): void => {
      for (const control of drawn.all('data-websearch-step-control')) {
        const id = control['data-websearch-step-control'] as WebSearchStepId;
        (control['ref'] as ((el: unknown) => void) | undefined)?.({ focus: () => focused.push(`bar:${id}`) });
      }
      for (const body of drawn.all('data-websearch-step-body')) {
        const id = body['data-websearch-step-body'] as WebSearchStepId;
        (body['ref'] as ((el: unknown) => void) | undefined)?.({ id, get hidden() { return id === 'provider' ? bodyHidden : false; }, querySelector: (sel: string) => (id === 'provider' && !bodyHidden && sel.startsWith('button') ? { focus: () => focused.push('in:provider') } : null) });
      }
    };
    stubRefs(second);
    // The press: the current step's body is hidden, so it is opened — and NOTHING is focused on the fold itself.
    (second.find('data-websearch-row-setup')!['onClick'] as () => void)();
    expect(focused).toEqual([]);
    // The reopened body is now in the markup (nothing is gated) and the landing effect focuses inside it.
    bodyHidden = false;
    harness.cursor = 0;
    const third = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    expect(third.card).not.toContain('data-websearch-step-body="provider" hidden');
    stubRefs(third);
    harness.cursor = 0;
    runEffects();
    expect(focused).toEqual(['in:provider']);
  });

  it('the card hands its route back on unmount, so a later press reaches nothing — fails if the cleanup is a no-op', () => {
    harness.cells.length = 0; harness.cursor = 0; harness.effects.length = 0; harness.cleanups.clear(); harness.pendingEffects.length = 0; views = null;
    const focused: WebSearchStepId[] = [];

    harness.cursor = 0;
    const drawn = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    harness.cursor = 0;
    runEffects();
    // The refs the render filled (a stub stands in for the DOM node a static render never makes), then the press.
    for (const control of drawn.all('data-websearch-step-control')) {
      const id = control['data-websearch-step-control'] as WebSearchStepId;
      (control['ref'] as ((el: unknown) => void) | undefined)?.({ focus: () => focused.push(id) });
    }
    const press = () => (drawn.find('data-websearch-row-setup')!['onClick'] as () => void)();
    press();
    expect(focused).toEqual(['provider']);

    // The unmount: the registration effect's cleanup hands the route back, and the SAME press now reaches nothing.
    expect(harness.cleanups.size).toBeGreaterThan(0);
    for (const cleanup of harness.cleanups.values()) cleanup();
    press();
    expect(focused).toEqual(['provider']);
  });
});

describe('the boundaries this change must not move', () => {
  it('the view carries at most ONE filled control in every state it can reach — fails if a second `.btn-primary` joins the MCP category (FND-3, Opus 5.5 review, 2026-11-09)', () => {
    // §1.7: "a dense screen carries exactly one accent surface". Before this fix the view held THREE at once — the
    // card-head `Check status`, the guided card's `Store the key` and the code-intelligence card's action.
    const fresh = draw({ listing: listing([row()]), webSearchSecrets: secrets([]) });
    expect((fresh.html.match(/class="btn btn-primary[^"]*"/g) ?? []).length).toBeLessThanOrEqual(1);
    // …and `Store the key` is the one that keeps the fill: it is the only control on the view that WRITES.
    const card = fresh.card;
    expect(card.match(/btn-primary/g) ?? []).toHaveLength(1);
    expect(card).toContain('data-websearch-store');
    // The state where nothing is being set up (a working card) falls back to `Check status`, still exactly one.
    const ready = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]), health: health({ state: 'healthy', toolCount: 2 }) });
    expect((ready.html.match(/class="btn btn-primary[^"]*"/g) ?? []).length).toBeLessThanOrEqual(1);
    // The card-head and the code-intelligence action are secondary now, as the mockup's own Providers card head draws
    // its `Check status`. The class is read off the markup so a later edit cannot silently restore the fill.
    const head = fresh.html.slice(fresh.html.indexOf('data-mcp-servers'), fresh.html.indexOf('data-mcp-websearch-setup'));
    expect(head).toContain('btn btn-secondary btn-compact');
    expect(head).not.toContain('btn-primary');
  });

  it('a successful delete hands focus to the step that needs the user, never to `body` — fails if the press leaves the view with nothing focused (FND-2, Opus 5.5 review, 2026-11-09)', async () => {
    harness.cells.length = 0; harness.cursor = 0; harness.effects.length = 0; harness.cleanups.clear(); harness.pendingEffects.length = 0; views = null;
    const focused: string[] = [];
    const setup = {
      onOpenFile: async () => ({ ok: true as const }),
      onGetKey: async () => ({ ok: true as const }),
      onStoreKey: async () => ({ ok: false as const, message: 'not pressed here' }),
      onDeleteKey: async () => ({ ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Workspace' as const, masked: null, removed: true }, refreshFailure: null }),
      onProbe: async () => ({ state: 'unknown' as const }),
    };
    const stubRefs = (drawn: ReturnType<typeof draw>): void => {
      for (const control of drawn.all('data-websearch-step-control')) {
        const id = control['data-websearch-step-control'] as WebSearchStepId;
        (control['ref'] as ((el: unknown) => void) | undefined)?.({ focus: () => focused.push(`bar:${id}`) });
      }
      for (const body of drawn.all('data-websearch-step-body')) {
        const id = body['data-websearch-step-body'] as WebSearchStepId;
        (body['ref'] as ((el: unknown) => void) | undefined)?.({ id, hidden: false, querySelector: (sel: string) => (id === 'provider' && sel.startsWith('button') ? { focus: () => focused.push('in:provider') } : null) });
      }
    };
    // The confirmation is rendered here too, and `Confirm` registers a `window` keydown listener in an effect — the
    // repo mounts no DOM under a test environment, so a minimal `window` stands in (as `confirm-dismissal.test.ts`).
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    try {
      // `stored` (a key is there): the delete button that opens the confirmation is present.
      const first = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]), webSearchSetup: setup });
      stubRefs(first);
      harness.cursor = 0;
      runEffects();
      (first.find('data-websearch-delete')!['onClick'] as () => void)();
      const withDialog = draw({ listing: listing([row()]), webSearchSecrets: secrets([keyRow]), webSearchSetup: setup });
      // Yes answers the confirmation; `remove` runs and, on success, bumps the counter the landing effect reads.
      (withDialog.find('onYes')!['onYes'] as () => void)();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      // The key is gone by now (production would have re-read the view as empty): `fresh`, whose step is `provider`.
      const after = draw({ listing: listing([row()]), webSearchSecrets: secrets([]), webSearchSetup: setup });
      expect(after.card).toContain('data-websearch-situation="fresh"');
      stubRefs(after);
      harness.cursor = 0;
      runEffects();
      // Focus was MOVED. `Confirm`'s own opener return had nothing to hand it to (its opener was disabled while the
      // press was in flight and is gone now), so without this the view would be left with `body` focused.
      expect(focused.length).toBeGreaterThan(0);
    } finally { vi.unstubAllGlobals(); }
  });
  it('the card head\'s icon control takes ONE height token, the same one both neighbouring heads carry — fails if it is left at `.btn`\'s taller min-height or loses its square (FND-6, Opus 5.5 review, 2026-11-09)', () => {
    const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // The control is an square at `--rt-control-height-compact` (24 px), the tier the two neighbouring card heads
    // take through `btn-compact`; without this rule `.btn-icon`'s 30 px height met `.btn`'s
    // `min-height: --rt-control-height` (32 px) and painted 30 x 32 — neither square nor one token (C2).
    expect(css).toContain('[data-mcp-websearch-setup] [data-websearch-about-control] { align-self: flex-start; margin-left: auto; width: var(--rt-control-height-compact); height: var(--rt-control-height-compact); }');
    // The literal pixel pair that stood for either axis is gone from the card's own rules.
    expect(css).not.toMatch(/\[data-websearch-about-control\][^}]*\b(30|32)px/);
  });

  it('the card still writes no server (REQ-CONFIG-350/464): no `writes enabled: true`, no second password field, one Store control — fails if the step bar brought a second write path with it', () => {
    const { card } = draw({ listing: listing([row({ enabled: false })]), webSearchSecrets: secrets([]) });
    // Scoped to THIS card: the sibling Configured-servers card states its own durable-write sentence, unchanged.
    expect(card).not.toContain('writes enabled: true');
    expect(card.match(/type="password"/g)).toHaveLength(1);
    expect(card.match(/data-websearch-store/g)).toHaveLength(1); // one Store control, and the card authors no server
  });

  it('the key control is still the same one, sized by the token, and the prose is still bounded — fails if the bar outranked the C3/C7 rules', () => {
    const { html } = draw();
    expect(html).toContain('class="input settings__key-field"');
    const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8');
    expect(css).toContain('[data-mcp-websearch-setup] .settings__key-field { width: max-content; max-width: 100%; min-width: var(--rt-field-min); }');
    expect(css).toContain('[data-mcp-websearch-setup] :is(p, .settings__hint):not(.mono) { max-width: var(--rt-prose-measure); overflow-wrap: anywhere; }');
  });

  it('the current step\'s control carries the house selection ink (tint + accent, §1.2) with ONE rule deciding its colour — fails if a second rule at the same specificity overrides the accent ink with neutral `--rt-text` (D3, PR #77 UI review, 2026-11-09)', () => {
    const raw = readFileSync(new URL('../shell.css', import.meta.url), 'utf8');
    // Comments are read out: the file's style STATES a removed rule beside its reason, so a comment naming the old
    // selector must not count as a live rule.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    // The active control is `is-active` AND `aria-current="step"` on the same element (`current === s.id`), so any
    // second rule naming `[aria-current…]` would silently beat this one on `color` and kill the accent ink.
    expect(css).toContain(".settings__steps--bar .btn.is-active { background: var(--rt-accent-tint-14); color: var(--rt-accent-200); }");
    expect(css).not.toMatch(/\.settings__steps--bar \.btn\[aria-current/);
  });

  it('the disabled card keeps its empty state and offers no step control — fails if the bar renders over a configuration that did not load', () => {
    const fatal = { loadOk: false, fatal: '/w/.rotaris/agents.yaml: bad indentation', files: { workspace: '/w/.rotaris/agents.yaml', global: '/g/agents.yaml' } } as unknown as ConfigSnapshot;
    const { card } = draw({ fatal });
    expect(card).toContain('data-websearch-situation="unavailable"');
    expect(card).not.toContain('data-websearch-step-bar');
    expect(card).not.toContain('data-websearch-about-control');
  });
});
