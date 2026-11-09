import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type { McpHealth, McpListing, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import { WEB_SEARCH_SERVER, WEB_SEARCH_PRESETS, bindWebSearchSetup } from './web-search-setup.js';
import type { McpSettingsProps } from './McpSettings.js';

/**
 * THE GUIDED CARD'S OWN BEHAVIOUR, driven without a window (rework rounds 1 and 2; findings Major 1, Major 2, Minor 1,
 * then round 2's Major 2 and Major 3). The repo mounts no DOM under a test environment, and a static render reaches no
 * event and re-runs no state, so this file fakes the two things a press needs and nothing else: `useState` becomes a
 * cell store a test can seed (the seated React instance is the module-level one, so cells persist ACROSS draws), and
 * the JSX runtime records every element so a control can be found by its `data-websearch-`/`role` attribute and its
 * own handler called. A press is then: draw, invoke the captured handler, let its microtasks settle, draw again — and
 * the second markup is what the user would see. (`settings-form-wiring.test.ts` pins hooks that cannot be driven; this
 * drives the card itself.)
 *
 * What is proven here, one reason each:
 *  - Major 1 (round 1): the card's own probe result decides `ready`/`wrong-endpoint` (`shownHealth` into
 *    `webSearchSituation`), so a card probe collapses a `stored` card and takes an already-`ready` card back to
 *    `wrong-endpoint`;
 *  - Major 2 (round 1): one in-flight state covers store/remove/open/probe — the controls are disabled while one
 *    holds, the state is stated in words, and a second press while one is in flight sends nothing;
 *  - Major 2 (round 2): a press that FAILS — a rejected re-read, or a handler that rejected outright — clears the
 *    busy state in a finally and reports the failure; the card is never left permanently disabled;
 *  - Major 3 (round 2, narrowed in round 3): the card's own probe result is kept under the inputs it was taken
 *    under AND the identity of the views it was read against, and is DISCARDED when either moves — a Healthy result
 *    cannot survive a changed key/endpoint, a re-read the card cannot interpret (the constant `***` mask carries no
 *    value), or a newer category probe, and a discarded result is never read again;
 *  - Minor 1 (round 1): the preset radios are one tab station (roving `tabIndex`), with the arrow keys moving focus
 *    with the selection.
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
/**
 * The views a draw hands the card, STABLE across draws within one test (round-3 Major 1/2: production's props hold
 * one object until a read REPLACES it — React state — so identity is the card's witness that a re-read happened; a
 * test overrides one field only to model exactly that). `reset()` rebuilds them.
 */
let views: { readonly listing: McpListing; readonly secrets: McpSecretsView; readonly webSearchSecrets: McpSecretsView } | null = null;
const viewsNow = () => (views ??= {
  listing: { configFile: '/ws/.rotaris/agents.yaml', rows: [row()] },
  secrets: secrets([keyRow]),
  webSearchSecrets: secrets([keyRow]),
});

const props = (over: Partial<McpSettingsProps> = {}): McpSettingsProps => ({
  listing: viewsNow().listing, loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: viewsNow().secrets, webSearchSecrets: viewsNow().webSearchSecrets, onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  webSearchSetup: {
    onOpenFile: async () => { opens += 1; return { ok: true as const }; },
    onGetKey: async () => ({ ok: true as const }),
    onStoreKey: async () => { stores += 1; return new Promise((resolve) => { storeGate = () => resolve({ ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: 'K', scope: 'Workspace' as const, masked: '***', removed: false }, refreshFailure: null }); }); },
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
const reset = (): void => { harness.cells.length = 0; probes = 0; stores = 0; deletes = 0; opens = 0; storeGate = null; health = { state: 'unknown' }; views = null; };

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

describe('a failing press clears the busy state and reports it (Major 2, round 2)', () => {
  it('a STANDING write whose re-read failed shows the masked outcome AND the refresh failure, and the controls come back — fails if a failed refresh is swallowed or leaves the card disabled', async () => {
    reset();
    const setup = {
      ...props().webSearchSetup,
      onStoreKey: async () => { stores += 1; return { ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: 'K', scope: 'Workspace' as const, masked: '***', removed: false }, refreshFailure: 'Render frame was disposed' }; },
      onDeleteKey: async () => { deletes += 1; return { ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: 'K', scope: 'Workspace' as const, masked: null, removed: true }, refreshFailure: 'Render frame was disposed' }; },
    };
    const first = draw({ webSearchSetup: setup });
    (first.find('data-websearch-store')!['onClick'] as () => void)();
    await settle();
    const afterStore = draw({ webSearchSetup: setup });
    expect(afterStore.html).not.toContain('data-websearch-in-flight');
    expect(afterStore.find('data-websearch-store')!['disabled']).toBe(false); // the card is NOT left permanently disabled
    expect(afterStore.html).toContain('Stored `K` for `web_search`'); // the write's own outcome is still reported
    expect(afterStore.html).toContain('data-websearch-refresh-failure');
    expect(afterStore.html).toContain('could not be refreshed');
    expect(afterStore.html).toContain('Render frame was disposed');
    // The delete shares the shape: opened through the Confirm dialog, whose Yes calls `remove`.
    (afterStore.find('data-websearch-delete')!['onClick'] as () => void)();
    const withDialog = draw({ webSearchSetup: setup });
    (withDialog.find('onYes')!['onYes'] as () => void)();
    await settle();
    const afterDelete = draw({ webSearchSetup: setup });
    expect(deletes).toBe(1);
    expect(afterDelete.html).not.toContain('data-websearch-in-flight');
    expect(afterDelete.html).toContain('Deleted `K` from `web_search` (Workspace).');
    expect(afterDelete.html).toContain('data-websearch-refresh-failure');
    expect(afterDelete.html).toContain('Render frame was disposed');
  });

  it('a REFUSED re-read — the binder resolving {ok:false}, not throwing — is a failed refresh the card SAYS (round-3 Minor): the real binder is driven over a command stub, and the warning names the refusal — fails if a swallowed refusal reads as a successful refresh of a view that never arrived', async () => {
    reset();
    // The REAL binder, as `useMcp` spreads it in: its read answers a resolved refusal (as `bridge.command` does),
    // and the command answers the masked write outcome.
    const setup = bindWebSearchSetup({
      command: async () => ({ ok: true, value: { server: WEB_SEARCH_SERVER, key: 'ROTARIS_SEARCH_API_KEY', scope: 'Workspace', masked: '***', removed: false } }),
      read: async () => ({ ok: false as const, message: 'Open a workspace first' }),
    });
    const first = draw({ webSearchSetup: setup });
    // The real binder refuses an empty value before it sends anything (REQ-MCP-084), so the draft is typed first.
    (first.find('data-websearch-key-field')!['onChange'] as (e: { currentTarget: { value: string } }) => void)({ currentTarget: { value: 'sk-live-123' } });
    const typed = draw({ webSearchSetup: setup });
    (typed.find('data-websearch-store')!['onClick'] as () => void)();
    await settle();
    const after = draw({ webSearchSetup: setup });
    expect(after.html).not.toContain('data-websearch-in-flight');
    expect(after.html).toContain('Stored `ROTARIS_SEARCH_API_KEY`'); // the write stood and is reported
    expect(after.html).toContain('data-websearch-refresh-failure');
    expect(after.html).toContain('could not be refreshed');
    expect(after.html).toContain('Open a workspace first');
  });

  it('a handler that REJECTS outright (a broken binding, not the guarded bridge) still clears the busy state and reports the failure — fails if a rejection out of a click handler strands the card with no words', async () => {
    reset();
    const setup = {
      ...props().webSearchSetup,
      onStoreKey: async (): Promise<never> => { stores += 1; throw new Error('the command channel is gone'); },
      onProbe: async (): Promise<never> => { probes += 1; throw new Error('the probe channel is gone'); },
    };
    const first = draw({ webSearchSetup: setup });
    (first.find('data-websearch-store')!['onClick'] as () => void)();
    await settle();
    const afterStore = draw({ webSearchSetup: setup });
    expect(afterStore.html).not.toContain('data-websearch-in-flight');
    expect(afterStore.find('data-websearch-store')!['disabled']).toBe(false);
    expect(afterStore.html).toContain('data-websearch-refusal');
    expect(afterStore.html).toContain('the command channel is gone');
    // And the probe: a rejected probe leaves the busy state and states the failure in its message.
    (afterStore.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    const afterProbe = draw({ webSearchSetup: setup });
    expect(afterProbe.html).not.toContain('data-websearch-in-flight');
    expect(afterProbe.find('data-websearch-check')!['disabled']).toBe(false);
    expect(afterProbe.html).toContain('data-websearch-probe-message');
    expect(afterProbe.html).toContain('the probe channel is gone');
  });

  it('a successful store clears the card\'s own probe result: the key changed beneath it, so an untested key cannot stay `ready` — fails if a result taken under the old key keeps deciding the state', async () => {
    reset();
    health = { state: 'healthy', toolCount: 2 };
    // A card probe answered Healthy: the card collapses on ITS result.
    const first = draw();
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    expect(draw().html).toContain('data-websearch-situation="ready"');
    // The user changes the key. The store stands (refreshFailure null) and the parent health is unknown — the OLD
    // probe result must not keep the card `ready` over a key it never saw.
    const setup = {
      ...props().webSearchSetup,
      onStoreKey: async () => { stores += 1; return { ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: 'K', scope: 'Workspace' as const, masked: '***', removed: false }, refreshFailure: null }; },
    };
    (draw({ webSearchSetup: setup }).find('data-websearch-change')!['onClick'] as () => void)(); // expand (the Change link)
    const expanded = draw({ webSearchSetup: setup });
    (expanded.find('data-websearch-store')!['onClick'] as () => void)();
    await settle();
    health = { state: 'unknown' };
    const after = draw({ webSearchSetup: setup });
    expect(after.html).toContain('data-websearch-confirmation');
    expect(after.html).not.toContain('data-websearch-situation="ready"');
    expect(after.html).not.toContain('data-websearch-summary');
    expect(after.html).toContain('data-websearch-situation="stored"');
  });
});

describe('the card\'s own probe result is keyed to the inputs it was taken under (Major 3, round 2)', () => {
  it('a Healthy card result cannot survive a CHANGED ENDPOINT — fails if an earlier Healthy keeps a changed, untested entry ready/collapsed', async () => {
    reset();
    health = { state: 'healthy', toolCount: 2 };
    const first = draw();
    expect(first.html).toContain('data-websearch-situation="stored"');
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    const ready = draw();
    expect(ready.html).toContain('data-websearch-situation="ready"');
    expect(ready.html).toContain('data-websearch-summary');
    // The entry's url changed (the user edited the file and the category reloaded): the old probe never saw it.
    const changed = draw({ listing: { configFile: '/ws/.rotaris/agents.yaml', rows: [row({ line: 'https://elsewhere.example/mcp' })] } });
    expect(changed.html).not.toContain('data-websearch-situation="ready"');
    expect(changed.html).not.toContain('data-websearch-summary');
    expect(changed.html).toContain('data-websearch-situation="stored"'); // the parent's health (unknown here) decides
  });

  it('a key replaced OUTSIDE this card cannot leave it `ready`: a FRESH READ of the card\'s own view — the only witness behind the one constant mask — discards the result (Major 1, round 3) — fails if a result survives a re-read it cannot interpret, leaving `ready` standing over an unprobed key', async () => {
    reset();
    // The mask is the production constant: every value arrives as `***` (REDACTION_MARK, run-host/mcp.ts), so a
    // replaced key is INVISIBLE in the view's content — the read itself is the only fact it carries.
    expect(keyRow.masked).toBe('***');
    health = { state: 'healthy', toolCount: 2 };
    const first = draw();
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    expect(draw().html).toContain('data-websearch-situation="ready"');
    // The key is replaced by a hand edit and the category re-reads its secrets (a new view object, same `***`):
    const changed = draw({ webSearchSecrets: secrets([keyRow]) });
    expect(changed.html).not.toContain('data-websearch-situation="ready"');
    expect(changed.html).not.toContain('data-websearch-summary');
    expect(changed.html).toContain('data-websearch-situation="stored"'); // the parent's health (unknown here) decides
  });

  it('a stale card result is NOT RESURRECTED when the parent health returns to its earlier value: it is discarded at the change, not merely bypassed (Major 2, round 3) — fails if a card Unreachable comes back after parent Checking → parent Healthy re-makes the old basis', async () => {
    reset();
    const parentHealthy = { [WEB_SEARCH_SERVER]: { state: 'healthy' as const, toolCount: 2 } };
    const first = draw({ health: parentHealthy });
    expect(first.html).toContain('data-websearch-situation="ready"'); // the parent's Healthy decides before any card probe
    health = { state: 'unreachable', detail: 'connect ECONNREFUSED 127.0.0.1:9' };
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    expect(draw({ health: parentHealthy }).html).toContain('data-websearch-situation="wrong-endpoint"'); // the card's own result decides
    // A newer category probe starts: the card's own result must be DISCARDED here, not ignored…
    const checking = draw({ health: { [WEB_SEARCH_SERVER]: { state: 'checking' as const } } });
    expect(checking.html).toContain('data-websearch-situation="stored"');
    // …so when the category's probe answers the SAME Healthy it held before, the discarded result cannot come back.
    const back = draw({ health: parentHealthy });
    expect(back.html).toContain('data-websearch-situation="ready"');
    expect(back.html).not.toContain('data-websearch-situation="wrong-endpoint"');
    expect(back.html).toContain('Healthy · 2 tools');
  });

  it('an OLD card result cannot override a NEWER category probe — fails if an earlier Unreachable outranks the parent row\'s newer Healthy', async () => {
    reset();
    health = { state: 'unreachable', detail: 'connect ECONNREFUSED' };
    const first = draw();
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    expect(draw().html).toContain('data-websearch-situation="wrong-endpoint"');
    // The category's own check (the header's `Check status`) then probed the same server and found it Healthy.
    const parentHealth = { [WEB_SEARCH_SERVER]: { state: 'healthy' as const, toolCount: 3 } };
    const after = draw({ health: parentHealth });
    expect(after.html).toContain('data-websearch-situation="ready"');
    expect(after.html).not.toContain('data-websearch-situation="wrong-endpoint"');
    expect(after.html).toContain('Healthy · 3 tools');
  });

  it('a NEWER unreachable parent health supersedes an older Healthy card result — fails if the card result wins over a changed parent health', async () => {
    reset();
    health = { state: 'healthy', toolCount: 1 };
    const first = draw();
    (first.find('data-websearch-check')!['onClick'] as () => void)();
    await settle();
    expect(draw().html).toContain('data-websearch-situation="ready"');
    const after = draw({ health: { [WEB_SEARCH_SERVER]: { state: 'unreachable' as const, detail: 'the parent probed it' } } });
    expect(after.html).toContain('data-websearch-situation="wrong-endpoint"');
    expect(after.html).toContain('the parent probed it');
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
