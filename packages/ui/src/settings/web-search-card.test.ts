import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type { McpHealth, McpListing, McpSecretsView, McpServerRow } from '@rotaris/contracts';
import { WEB_SEARCH_KEY_VARIABLE, WEB_SEARCH_SERVER, type WebSearchSaveReply, type WebSearchScope } from './web-search-setup.js';
import type { McpSettingsProps } from './McpSettings.js';

/**
 * THE WEB SEARCH PANEL'S OWN BEHAVIOUR, driven without a window (R-117). The repo mounts no DOM under a test environment
 * and a static render reaches no event, so this file fakes the two things a press needs: `useState` becomes a cell
 * store a test can seed (cells persist ACROSS draws), and the JSX runtime records every element so a control can be
 * found by its `data-websearch-` attribute and its own handler called. A press is then: draw, invoke the captured
 * handler, let its microtasks settle, draw again — and the second markup is what the user would see.
 *
 * What is proven here, one reason each: Save and test sends the typed key and the chosen scope and reports each step;
 * one in-flight state disables every control and is said in words; a Test result is kept only while the views it was
 * read against stand; Delete deletes in the scope the key is stored in; the provider disclosure opens in place.
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

const KEY = `\${${WEB_SEARCH_KEY_VARIABLE}}`;
const row = (over: Partial<McpServerRow> = {}): McpServerRow => ({
  name: WEB_SEARCH_SERVER, type: 'http', line: `https://mcp.tavily.com/mcp/?tavilyApiKey=${KEY}`, origin: 'default',
  enabled: false, overridden: false, available: false, availabilityDetail: '', unresolved: [WEB_SEARCH_KEY_VARIABLE], expectedKeys: [], ...over,
});
const ready = row({ line: 'https://mcp.tavily.com/mcp/?tavilyApiKey=***', unresolved: [], available: true, enabled: true });
const keyRow = { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, masked: '***', scope: 'Workspace' as const };
const secrets = (rows: typeof keyRow[]): McpSecretsView => ({ servers: [WEB_SEARCH_SERVER], rows, expected: [], server: null });

let health: McpHealth = { state: 'unknown' };
let saveGate: ((r: WebSearchSaveReply) => void) | null = null;
let saved: { value: string; scope: WebSearchScope }[] = [];
let deleted: WebSearchScope[] = [];
let probes = 0;
let used: { preset: string; typed: string; scope: WebSearchScope }[] = [];
/** The views a draw hands the panel, stable across draws until a test replaces one (as a re-read would). */
let views: { listing: McpListing; webSearchSecrets: McpSecretsView } | null = null;
const viewsNow = (rows: McpServerRow[] = [row()], keys: typeof keyRow[] = []) => (views ??= { listing: { configFile: '/ws/.rotaris/agents.yaml', rows }, webSearchSecrets: secrets(keys) });

const props = (over: Partial<McpSettingsProps> = {}): McpSettingsProps => ({
  listing: viewsNow().listing, loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: secrets([]), webSearchSecrets: viewsNow().webSearchSecrets, onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  webSearchSetup: {
    onSaveAndTest: (value, scope) => { saved.push({ value, scope }); return new Promise((resolve) => { saveGate = resolve; }); },
    onEnableAndTest: async () => ({ ok: true as const, lines: ['Switched on.'], health: { state: 'healthy' as const, toolCount: 1 }, refreshFailure: null }),
    onDeleteKey: async (scope) => { deleted.push(scope); return { ok: true as const, outcome: { server: WEB_SEARCH_SERVER, key: WEB_SEARCH_KEY_VARIABLE, scope: 'Global' as const, masked: null, removed: true }, refreshFailure: null }; },
    onProbe: async (): Promise<McpHealth> => { probes += 1; return health; },
    onOpenFile: async () => ({ ok: true as const }),
    onGetKey: async () => ({ ok: true as const }),
    onUseProvider: async (preset, typed, scope) => { used.push({ preset: preset.id, typed, scope }); return { ok: true as const, lines: [`Web search now reaches ${preset.name}.`], health: null, refreshFailure: null }; },
  },
  ...over,
});

function draw(over: Partial<McpSettingsProps> = {}): { html: string; find: (attr: string) => Record<string, unknown> } {
  harness.elements.length = 0; harness.cursor = 0;
  const html = renderToStaticMarkup(createElement(McpSettings, props(over)));
  const panel = html.slice(html.indexOf('data-mcp-websearch-setup'), html.indexOf('data-mcp-setup'));
  return { html: panel, find: (attr) => harness.elements.find((e) => e.props[attr] !== undefined)!.props };
}
const press = (d: ReturnType<typeof draw>, attr: string) => (d.find(attr)['onClick'] as () => void)();
const type = (d: ReturnType<typeof draw>, value: string) => (d.find('data-websearch-key-field')['onChange'] as (e: unknown) => void)({ currentTarget: { value } });
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const reset = (): void => { harness.cells.length = 0; used = []; saved = []; deleted = []; probes = 0; saveGate = null; health = { state: 'unknown' }; views = null; };

describe('Save and test, pressed', () => {
  it('sends the typed key and the chosen scope, holds every control while it runs and says so, then reports each step and empties the field — fails if a step goes unsaid or the key stays in the field', async () => {
    reset();
    const first = draw();
    type(first, 'tvly-abc');
    (draw().find('data-websearch-scope')['onChange'] as (e: unknown) => void)({ currentTarget: { value: 'global' } });
    press(draw(), 'data-websearch-save');
    await settle();
    expect(saved).toEqual([{ value: 'tvly-abc', scope: 'global' }]);
    const during = draw();
    expect(during.html).toContain('Storing the key, switching the server on and checking it…');
    expect(during.find('data-websearch-key-field')['disabled']).toBe(true);
    expect(during.find('data-websearch-save')['disabled']).toBe(true);
    expect(during.find('data-websearch-other-control')).toBeDefined();
    // A second press while one holds sends nothing.
    press(during, 'data-websearch-save');
    expect(saved).toHaveLength(1);
    saveGate!({ ok: true, lines: ['Key stored (Global), value ***.', 'The server answered: Healthy · 2 tools.'], health: { state: 'healthy', toolCount: 2 }, refreshFailure: null });
    await settle();
    const after = draw();
    expect(after.html).toContain('Key stored (Global), value ***.');
    expect(after.html).toContain('The server answered: Healthy · 2 tools.');
    expect(after.find('data-websearch-key-field')['value']).toBe('');
    expect(after.html).not.toContain('Storing the key');
  });

  it('a refusal is said as an alert and the typed key is kept for another try — fails if a refused save loses what was typed', async () => {
    reset();
    type(draw(), 'tvly-abc');
    press(draw(), 'data-websearch-save');
    await settle();
    saveGate!({ ok: false, message: 'disk full', lines: [] });
    await settle();
    const after = draw();
    expect(after.html).toContain('role="alert" data-websearch-refusal="true">disk full');
    expect(after.find('data-websearch-key-field')['value']).toBe('tvly-abc');
  });
});

describe('the panel\'s own Test result', () => {
  it('is shown while the views it was read against stand, and dropped when a re-read replaces them — fails if an old Healthy stands over a state it never saw', async () => {
    reset();
    viewsNow([ready], [keyRow]);
    health = { state: 'healthy', toolCount: 4 };
    press(draw(), 'data-websearch-check');
    await settle();
    expect(probes).toBe(1);
    expect(draw().html).toContain('Healthy · 4 tools');
    // A re-read hands new objects (a key replaced elsewhere masks identically): the result no longer describes them.
    views = { listing: { configFile: '/ws/.rotaris/agents.yaml', rows: [ready] }, webSearchSecrets: secrets([keyRow]) };
    draw();
    const after = draw();
    expect(after.html).not.toContain('Healthy · 4 tools');
    expect(after.html).toContain('Not tested yet');
  });
});

describe('the other presses', () => {
  it('Delete, confirmed, deletes in the scope the key is stored in — fails if the scope select decides which file loses the key', async () => {
    reset();
    viewsNow([ready], [{ ...keyRow, scope: 'Global' as const }] as unknown as typeof keyRow[]);
    press(draw(), 'data-websearch-delete');
    const d = draw();
    expect(d.html).toContain('Delete the stored key?');
    // The scope select says Workspace; the key lives in Global.
    const yes = harness.elements.find((e) => typeof e.props['onYes'] === 'function')!.props['onYes'] as () => void;
    yes();
    await settle();
    expect(deleted).toEqual(['global']);
    expect(draw().html).toContain('Key deleted from the Global scope.');
  });

  it('Use a different provider opens in place and shows the stanza for the chosen provider — fails if the file edit is unreachable', () => {
    reset();
    expect(draw().html).toMatch(/id="websearch-other"[^>]*hidden/);
    press(draw(), 'data-websearch-other-control');
    const open = draw();
    expect(open.html).not.toMatch(/id="websearch-other"[^>]*hidden/);
    const linkup = harness.elements.find((e) => e.props['role'] === 'radio' && String(e.props['aria-label']).startsWith('Linkup'))!;
    (linkup.props['onClick'] as () => void)();
    expect(draw().html).toContain('https://mcp.linkup.so/mcp?apiKey=');
  });

  it('choosing Linkup and pressing Use Linkup writes it in the chosen scope and says so; your own server sends the typed address (PD-CONFIG-013) — fails if the press writes another provider than the one shown', async () => {
    reset();
    press(draw(), 'data-websearch-other-control');
    draw();
    (harness.elements.find((e) => e.props['role'] === 'radio' && String(e.props['aria-label']).startsWith('Linkup'))!.props['onClick'] as () => void)();
    (draw().find('data-websearch-scope')['onChange'] as (e: unknown) => void)({ currentTarget: { value: 'global' } });
    const d = draw();
    expect(d.html).toContain('Use Linkup');
    press(d, 'data-websearch-use');
    await settle();
    expect(used).toEqual([{ preset: 'linkup', typed: '', scope: 'global' }]);
    expect(draw().html).toContain('Web search now reaches Linkup.');
    draw();
    (harness.elements.find((e) => e.props['role'] === 'radio' && String(e.props['aria-label']).startsWith('Your own server'))!.props['onClick'] as () => void)();
    (draw().find('data-websearch-own-url')['onChange'] as (e: unknown) => void)({ currentTarget: { value: 'https://search.example.org/mcp' } });
    const own = draw();
    expect(own.html).toContain('Use this server');
    press(own, 'data-websearch-use');
    await settle();
    expect(used.at(-1)).toEqual({ preset: 'own', typed: 'https://search.example.org/mcp', scope: 'global' });
  });
});
