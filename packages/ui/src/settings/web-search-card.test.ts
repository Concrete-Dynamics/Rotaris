import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type { McpHealth, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import { WEB_SEARCH_SERVER, WEB_SEARCH_PRESETS } from './web-search-setup.js';
import type { McpSettingsProps } from './McpSettings.js';

/**
 * THE GUIDED CARD'S OWN BEHAVIOUR, driven without a window (rework round 1, 2026-11-09; findings Major 1, Major 2,
 * Minor 1). The repo mounts no DOM under a test environment, and a static render reaches no event and re-runs no
 * state, so this file fakes the two things a press needs and nothing else: `useState` becomes a cell store a test can
 * seed (the seated React instance is the module-level one, so cells persist ACROSS draws), and the JSX runtime
 * records every element so a control can be found by its `data-websearch-`/`role` attribute and its own handler
 * called. A press is then: draw, invoke the captured handler, let its microtasks settle, draw again — and the second
 * markup is what the user would see. (`settings-form-wiring.test.ts` pins hooks that cannot be driven; this drives
 * the card itself.)
 *
 * What is proven here, one reason each:
 *  - Major 1: the card's own probe result decides `ready`/`wrong-endpoint` (`shownHealth` into `webSearchSituation`),
 *    so a card probe collapses a `stored` card and takes an already-`ready` card back to `wrong-endpoint`;
 *  - Major 2: one in-flight state covers store/remove/open/probe — the controls are disabled while one holds, the
 *    state is stated in words, and a second press while one is in flight sends nothing;
 *  - Minor 1: the preset radios are one tab station (roving `tabIndex`), with the arrow keys moving focus with the
 *    selection.
 */
const harness = vi.hoisted(() => ({
  elements: [] as { props: Record<string, unknown> }[],
  cells: [] as { initialised: boolean; value: unknown }[],
  cursor: 0,
}));
const record = (fn: unknown) => (type: unknown, props: Record<string, unknown> | null, ...rest: unknown[]) => {
  harness.elements.push({ props: props ?? {} });
  return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
};
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
const { McpSettings } = await import('./McpSettings.js');

const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: 'https://x/mcp', origin: 'default',
  enabled: true, overridden: false, available: true, availabilityDetail: '', unresolved: [], expectedKeys: [], ...over,
});
const keyRow = { server: WEB_SEARCH_SERVER, key: 'ROTARIS_SEARCH_API_KEY', masked: '***', scope: 'Workspace' as const };
const secrets = (rows: typeof keyRow[]): McpSecretsView => ({ servers: [WEB_SEARCH_SERVER], rows, expected: [], server: null });

let health: McpHealth = { state: 'unknown' };
let storeGate: (() => void) | null = null;
let probes = 0;
let stores = 0;
let deletes = 0;
let opens = 0;

const props = (over: Partial<McpSettingsProps> = {}): McpSettingsProps => ({
  listing: { configFile: '/ws/.rotaris/agents.yaml', rows: [row()] }, loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: secrets([keyRow]), webSearchSecrets: secrets([keyRow]), onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  webSearchSetup: {
    onOpenFile: async () => { opens += 1; return { ok: true as const }; },
    onGetKey: async () => ({ ok: true as const }),
    onStoreKey: async () => { stores += 1; return new Promise((resolve) => { storeGate = () => resolve({ ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: 'K', scope: 'Workspace' as const, masked: '***', removed: false } }); }); },
    onDeleteKey: async () => { deletes += 1; return { ok: false as const, message: 'not pressed here' }; },
    onProbe: async (): Promise<McpHealth> => { probes += 1; return health; },
  },
  ...over,
});

/** One draw: collect the elements and the markup at the cells' current values. A design-system wrapper spreads its
 * props onto its inner element, so every marked element is captured twice; the helpers dedupe on the first capture. */
function draw(over: Partial<McpSettingsProps> = {}): { html: string; find: (attr: string) => Record<string, unknown> | undefined; radios: Record<string, unknown>[]; group: () => Record<string, unknown> } {
  harness.elements.length = 0; harness.cursor = 0;
  const html = renderToStaticMarkup(createElement(McpSettings, props(over)));
  const seen = new Set<string>();
  const radios: Record<string, unknown>[] = [];
  for (const e of harness.elements) {
    if (e.props['role'] !== 'radio') continue;
    const name = e.props['aria-label'];
    if (typeof name !== 'string') continue;
    if (seen.has(name)) continue;
    seen.add(name);
    radios.push(e.props);
  }
  return {
    html,
    find: (attr) => harness.elements.find((e) => e.props[attr] !== undefined)?.props,
    radios,
    // Absent while the card is collapsed (steps 1–3 give way to the summary): a test that asks for it then is wrong.
    group: () => harness.elements.find((e) => e.props['data-websearch-presets'] !== undefined)!.props,
  };
}
/** Let every microtask of a press settle (the handlers await one promise chain and nothing else). */
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const reset = (): void => { harness.cells.length = 0; probes = 0; stores = 0; deletes = 0; opens = 0; storeGate = null; health = { state: 'unknown' }; };

describe('the guided card\'s own probe result decides its situation (Major 1, rework round 1)', () => {
  it('a card probe that answers Healthy takes a `stored` card to `ready` — the card collapses on ITS own test — fails if the situation reads the parent\'s health instead', async () => {
    reset();
    const first = draw();
    expect(first.html).toContain('data-websearch-situation="stored"');
    health = { state: 'healthy', toolCount: 2 };
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    const second = draw();
    expect(second.html).toContain('data-websearch-situation="ready"');
    expect(second.html).toContain('data-websearch-summary');
    expect(second.html).toContain('Healthy · 2 tools');
    expect(probes).toBe(1);
  });

  it('a card probe that answers Unreachable takes an ALREADY-ready card back to `wrong-endpoint` — fails if a failing probe cannot leave `ready`', async () => {
    reset();
    // The card is already ready: its shape with a parent health that says Healthy and a stored key (no probe yet).
    const parentHealth = { [WEB_SEARCH_SERVER]: { state: 'healthy' as const, toolCount: 2 } };
    const first = draw({ health: parentHealth });
    expect(first.html).toContain('data-websearch-situation="ready"');
    health = { state: 'unreachable', detail: 'connect ECONNREFUSED 127.0.0.1:9' };
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    const second = draw({ health: parentHealth });
    expect(second.html).toContain('data-websearch-situation="wrong-endpoint"');
    expect(second.html).toContain('connect ECONNREFUSED 127.0.0.1:9');
    expect(second.html).not.toContain('data-websearch-summary');
  });

  it('the parent row\'s health is untouched by a card probe: the same parent props show the same row state — fails if the card writes the parent\'s map', async () => {
    reset();
    const parentHealth = { [WEB_SEARCH_SERVER]: { state: 'unreachable' as const, detail: 'the parent probed it' } };
    const first = draw({ health: parentHealth });
    // The card's own probe (Healthy) collapses the card while the ROW keeps reading the parent's Unreachable.
    health = { state: 'healthy', toolCount: 1 };
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    const second = draw({ health: parentHealth });
    expect(second.html).toContain('data-websearch-situation="ready"');
    expect(second.html).toContain('Healthy · 1 tool');
    // The row's own state is the parent's, unchanged by the card's probe (no leaked write into props.health).
    expect(second.html).toMatch(/data-mcp-server="web_search"[^>]*data-health="unreachable"/);
    expect(second.html).toMatch(/data-health-text[^>]*>Unreachable</);
    expect(second.html).toContain('the parent probed it');
  });
});

describe('the card is disabled, in words, while a press is in flight (Major 2)', () => {
  it('a store in flight disables the field, the scope, both key controls and the probe, and says what is happening — fails if the completion can clobber a draft typed meanwhile', async () => {
    reset();
    const first = draw();
    const store = first.find('data-websearch-store')!;
    expect(store['disabled']).toBe(false);
    (store['onClick'] as () => void)();
    await settle();
    expect(stores).toBe(1);
    const pending = draw();
    expect(pending.html).toContain('data-websearch-in-flight');
    expect(pending.html).toContain('Storing the key');
    for (const attr of ['data-websearch-store', 'data-websearch-delete', 'data-websearch-check']) expect(pending.find(attr)!['disabled']).toBe(true);
    expect(pending.find('data-websearch-key-field')!['disabled']).toBe(true);
    expect(pending.find('data-websearch-scope')!['disabled']).toBe(true);
    // A second press while one holds sends NOTHING (the overlapping-write guard).
    (pending.find('data-websearch-store')!['onClick'] as () => void)();
    await settle();
    expect(stores).toBe(1);
    expect(deletes).toBe(0); // and the delete was never reachable while the store was in flight
    // The write answers: the controls come back and the state in words is gone.
    storeGate!();
    await settle();
    const after = draw();
    expect(after.html).not.toContain('data-websearch-in-flight');
    expect(after.find('data-websearch-store')!['disabled']).toBe(false);
    expect(after.html).toContain('Stored `K` for `web_search`');
  });

  it('a probe in flight disables the probe and the key controls and states itself — fails if the probe and a write can overlap', async () => {
    reset();
    let gate: (() => void) | null = null;
    const probed = draw({ webSearchSetup: { ...props().webSearchSetup, onProbe: async (): Promise<McpHealth> => { probes += 1; return new Promise((resolve) => { gate = () => resolve({ state: 'unknown' }); }); } } });
    (probed.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    const pending = draw({ webSearchSetup: { ...props().webSearchSetup, onProbe: async (): Promise<McpHealth> => { probes += 1; return new Promise((resolve) => { gate = () => resolve({ state: 'unknown' }); }); } } });
    expect(pending.html).toContain('Checking the server');
    expect(pending.find('data-websearch-store')!['disabled']).toBe(true);
    expect(pending.find('data-websearch-check')!['disabled']).toBe(true);
    gate!();
    await settle();
    const after = draw();
    expect(after.html).not.toContain('data-websearch-in-flight');
    expect(probes).toBe(1);
  });

  it('an open-file press is in flight like the others — fails if the opener and the probe can overlap', async () => {
    reset();
    let gate: (() => void) | null = null;
    const setup = { ...props().webSearchSetup, onOpenFile: async () => { opens += 1; return new Promise<{ ok: true }>((resolve) => { gate = () => resolve({ ok: true as const }); }); } };
    (draw({ webSearchSetup: setup }).find('data-websearch-open')!['onClick'] as () => void)();
    await settle();
    const pending = draw({ webSearchSetup: setup });
    expect(pending.html).toContain('Opening the configuration file');
    expect(pending.find('data-websearch-check')!['disabled']).toBe(true);
    gate!();
    await settle();
    expect(draw({ webSearchSetup: setup }).html).not.toContain('data-websearch-in-flight');
    expect(opens).toBe(1);
  });
});

describe('the preset radios are one tab station (Minor 1, REQ-SHELL-145/146)', () => {
  it('selected or not, exactly one radio is tabbable and it is the selected one (the first while none is selected) — fails if every radio is its own tab stop', () => {
    reset();
    const idle = draw();
    expect(idle.radios.map((r) => r['tabIndex'])).toEqual([0, -1, -1, -1]);
    expect(idle.radios.map((r) => r['aria-checked'])).toEqual([false, false, false, false]);
    // Select one by pressing it.
    const brave = idle.radios[1]!;
    (brave['onClick'] as () => void)();
    const chosen = draw();
    expect(chosen.radios.map((r) => r['tabIndex'])).toEqual([-1, 0, -1, -1]);
    expect(chosen.html).toContain('data-preset-selected="yes"');
  });

  it('an arrow moves the selection AND the focus with it — fails if the tabIndex follows the selection but the focus stays behind', () => {
    reset();
    const focused: string[] = [];
    const idle = draw();
    // The card keeps its radios in a ref map; the element each ref receives is stood in for by a stub that records
    // `focus()`, so the arrow's focus move is observable without a DOM (the ref prop is the JSX element's own).
    WEB_SEARCH_PRESETS.forEach((p, i) => {
      const stub = { focus: () => focused.push(p.id) };
      (idle.radios[i]!['ref'] as (el: unknown) => void)(stub);
    });
    (idle.radios[0]!['onClick'] as () => void)();
    const chosen = draw();
    WEB_SEARCH_PRESETS.forEach((p, i) => { (chosen.radios[i]!['ref'] as (el: unknown) => void)({ focus: () => focused.push(p.id) }); });
    (chosen.group()['onKeyDown'] as (e: { key: string; preventDefault: () => void }) => void)({ key: 'ArrowDown', preventDefault: () => undefined });
    expect(focused).toContain('brave');
    const moved = draw();
    expect(moved.radios.map((r) => r['tabIndex'])).toEqual([-1, 0, -1, -1]);
    expect(moved.radios[1]!['aria-checked']).toBe(true);
  });
});
