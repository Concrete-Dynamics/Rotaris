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
  WEB_SEARCH_TAKE_EFFECT, webSearchAboutControlLabel, webSearchRowSetupVisible, webSearchStepFor, webSearchStepLabel,
} from './web-search-setup.js';
import type { WebSearchSituation } from './web-search-setup.js';

/**
 * THE STEP BAR, THE INFO DISCLOSURE AND THE ROW'S OFFER (the stepper/inline-help change, 2026-11-09).
 *
 * The change turns the card's four loose kicker paragraphs into one bar of four named steps, moves three explanatory
 * sentences behind a single icon control, and offers the way into the card from the `web_search` row while there is
 * still something for it to do. These cases pin exactly that, and each names the one reason it can fail:
 *
 *  - the pure half (`WEB_SEARCH_STEPS`, `webSearchStepLabel`, `webSearchStepFor`, `webSearchRowSetupVisible`) so the
 *    labels, the current step and the row control's visibility are assertable without a window;
 *  - the rendered markup: ONE `ph ph-info` control in the head with a name and `aria-expanded`, `aria-controls` onto
 *    its region; FOUR step controls, `Step N · <title>`, exactly one `aria-current="step"`; every control's
 *    `aria-controls` naming an element that is actually in the markup (a dangling id is the shape of a broken
 *    disclosure); every body OPEN by default (`hidden` absent);
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
const health = (h: McpHealth): Record<string, McpHealth> => ({ [WEB_SEARCH_SERVER]: h });
describe('the step bar, the info control and the row offer — the pure half', () => {
  it('names exactly four steps, in order, each labelled `Step N · <title>` from its own position — fails if the numbering or the order lives anywhere but the list', () => {
    expect(WEB_SEARCH_STEPS.map((s) => s.id)).toEqual(['provider', 'declaration', 'key', 'test']);
    // `Array.map` passes (value, index), and `webSearchStepLabel` takes (index, step) — so the callback is explicit.
    expect(WEB_SEARCH_STEPS.map((step, index) => webSearchStepLabel(index, step))).toEqual([
      'Step 1 · Choose your search provider',
      'Step 2 · Put this in your configuration file',
      'Step 3 · Paste the key',
      'Step 4 · Test it',
    ]);
  });

  it('lands every situation on the step that needs the user — fails if a key-side situation points at the provider step or a stored key points anywhere but the test', () => {
    const expected: Readonly<Record<WebSearchSituation, ReturnType<typeof webSearchStepFor>>> = {
      unavailable: 'provider', 'no-entry': 'provider', 'other-transport': 'provider', fresh: 'provider',
      'needs-key': 'key', 'needs-enabled': 'key', 'needs-unresolved': 'key',
      stored: 'test', 'wrong-endpoint': 'test', ready: 'test',
    };
    for (const [situation, step] of Object.entries(expected)) {
      expect(webSearchStepFor(situation as WebSearchSituation)).toBe(step);
    }
  });

  it('offers the row control exactly while it can still do something — fails if it stands with a key already stored, without a row, or on another transport', () => {
    expect(webSearchRowSetupVisible(row(), null)).toBe(true);
    expect(webSearchRowSetupVisible(row(), keyRow)).toBe(false);
    expect(webSearchRowSetupVisible(null, null)).toBe(false);
    expect(webSearchRowSetupVisible(row({ type: 'stdio' }), null)).toBe(false);
  });

  it('the info control says which press it offers, and its closed name is the one constant — fails if the control keeps a `Show` name while the region is open', () => {
    expect(webSearchAboutControlLabel(false)).toBe(WEB_SEARCH_ABOUT_CONTROL);
    expect(webSearchAboutControlLabel(true)).not.toBe(WEB_SEARCH_ABOUT_CONTROL);
  });

  it('the about region holds exactly the three sentences that moved, word for word, and never a generic `Info` — fails if a sentence was reworded, dropped, or if the control is named by the banned noun', () => {
    expect(WEB_SEARCH_ABOUT).toHaveLength(3);
    expect(WEB_SEARCH_ABOUT).toContain(WEB_SEARCH_NOT_WRITTEN_BY_US);
    expect(WEB_SEARCH_ABOUT).toContain(WEB_SEARCH_TAKE_EFFECT);
    expect(WEB_SEARCH_ABOUT_CONTROL).not.toBe('Info');
    expect(WEB_SEARCH_ABOUT_CONTROL).toContain('web search');
  });

  it('the row control\'s words are the surface\'s own and its name identifies it and its server — fails if it is labelled "Add provider" or its name drops the server', () => {
    expect(WEB_SEARCH_SETUP_ROW_ACTION).toBe('Set up web search');
    expect(WEB_SEARCH_SETUP_ROW_ACTION).not.toContain('Add provider');
    expect(WEB_SEARCH_SETUP_ROW_LABEL).toContain(WEB_SEARCH_SETUP_ROW_ACTION);
    expect(WEB_SEARCH_SETUP_ROW_LABEL).toContain(WEB_SEARCH_SERVER);
    expect(WEB_SEARCH_SETUP_ROW_DESCRIPTION).toContain('step that needs you');
  });
});

describe('the card as it renders', () => {
  it('carries ONE named icon control in the head, whose `aria-controls` names its own region (REQ-SHELL-144/149) — fails if the icon is decoration, unnamed, or the disclosure is a bare chevron', () => {
    const { html, find } = draw();
    const control = find('data-websearch-about-control');
    expect(control).toBeDefined();
    expect(control!['aria-label']).toBe(WEB_SEARCH_ABOUT_CONTROL);
    expect(control!['aria-expanded']).toBe(false);
    expect(control!['aria-controls']).toBe('websearch-about');
    // The region an expanded control names is what the open state renders (`aria-controls` never dangles).
    expect(html).not.toContain('<div id="websearch-about"');
    expect(html).toContain('<i class="ph ph-info" aria-hidden="true"></i>');
    // No dialog, no second control of the kind.
    expect(harness.elements.filter((e) => e.props['data-websearch-about-control'] !== undefined)).toHaveLength(2);
  });

  it('the head no longer carries the loose prose: the three sentences stand in the about region alone — fails if the explanation is still dumped in front of step 1', () => {
    const { card } = draw({ listing: listing([row()]), secrets: secrets([]) });
    // Closed by default: none of the three sentences is in the markup, and none is anywhere else either.
    expect(card).not.toContain('Point the built-in web-search server at a provider');
    expect(card).not.toContain(escaped(WEB_SEARCH_NOT_WRITTEN_BY_US));
    expect(card).not.toContain(escaped(WEB_SEARCH_TAKE_EFFECT));
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
    // The four bodies carry the four headings word for word — the old kickers are gone.
    for (const step of WEB_SEARCH_STEPS) expect(html).toContain(`>${step.title}<`);
    expect(html).not.toContain('>Step 1<');
    expect(html).not.toContain('>Step 4<');
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
    expect(second.html).toContain('data-websearch-about');
    expect(second.html).toContain(escaped(WEB_SEARCH_NOT_WRITTEN_BY_US));
    expect(second.html).toContain(escaped(WEB_SEARCH_TAKE_EFFECT));
    expect(second.find('data-websearch-about-control')!['aria-expanded']).toBe(true);
    expect(second.find('data-websearch-about-control')!['aria-label']).not.toBe(WEB_SEARCH_ABOUT_CONTROL);
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

  it('offers the way into the card from the `web_search` row while no key is stored — fails if the row never offers it, or offers it with a key already stored', () => {
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

  it('the row control\'s press is inert with no card route registered, and never throws — fails if a press on the row rejects', () => {
    const { find } = draw();
    expect(() => (find('data-websearch-row-setup')!['onClick'] as () => void)()).not.toThrow();
  });
});

describe('the boundaries this change must not move', () => {
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

  it('the disabled card keeps its empty state and offers no step control — fails if the bar renders over a configuration that did not load', () => {
    const fatal = { loadOk: false, fatal: '/w/.rotaris/agents.yaml: bad indentation', files: { workspace: '/w/.rotaris/agents.yaml', global: '/g/agents.yaml' } } as unknown as ConfigSnapshot;
    const { card } = draw({ fatal });
    expect(card).toContain('data-websearch-situation="unavailable"');
    expect(card).not.toContain('data-websearch-step-bar');
    expect(card).not.toContain('data-websearch-about-control');
  });
});
