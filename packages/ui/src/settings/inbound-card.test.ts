import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type { InboundExposure, McpListing } from '@rotaris/contracts';
import type { McpSettingsProps } from './McpSettings.js';

/**
 * REQ-MCP-120/121 (MAJOR, 2026-11-25): the inbound surface's CARD, driven without a window — the same harness the web
 * search card's test uses (a cell store behind `useState`, the JSX runtime recording every element so a control is found
 * by its `data-inbound-` attribute and its own handler called).
 *
 * The defect this file pins: the card read `inbound.exposure` (the CLOSED-OVER prop, i.e. the previous render) AFTER
 * awaiting the toggle, so the token the enabling press's answer carries was never shown on the first switch-on. It reads
 * the answer of the press now.
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

const listing = (): McpListing => ({ configFile: '/ws/.rotaris/agents.yaml', rows: [] });

function props(inbound: McpSettingsProps['inbound']): McpSettingsProps {
  return {
    listing: listing(), loading: false, error: null, health: {}, probing: false,
    onRefresh: () => undefined, onProbeAll: async () => undefined,
    onToggle: async () => ({ ok: true, message: '' }),
    secrets: null, webSearchSecrets: null, onSecretsServer: () => undefined, setup: null,
    onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
    webSearchSetup: {
      onOpenFile: async () => ({ ok: true as const }),
      onGetKey: async () => ({ ok: true as const }),
      onSaveAndTest: async () => ({ ok: false as const, message: 'not pressed here', lines: [] }),
      onEnableAndTest: async () => ({ ok: false as const, message: 'not pressed here', lines: [] }),
      onUseProvider: async () => ({ ok: false as const, message: 'not pressed here', lines: [] }),
      onDeleteKey: async () => ({ ok: false as const, message: 'not pressed here' }),
      onProbe: async () => ({ state: 'unknown' as const }),
    },
    inbound,
  } satisfies McpSettingsProps;
}

function draw(inbound: McpSettingsProps['inbound']): { html: string } {
  harness.elements.length = 0; harness.cursor = 0;
  const html = renderToStaticMarkup(createElement(McpSettings, props(inbound)));
  return { html };
}
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
const press = (): void => { (harness.elements.find((e) => e.props['data-inbound-toggle'] !== undefined)!.props['onClick'] as () => void)(); };

describe('REQ-MCP-120/121: the inbound surface card shows the token the enabling press answers', () => {
  it('the FIRST switch-on shows the token the press’s own answer carries (not the stale prop)', async () => {
    harness.cells.length = 0;
    // The prop the card was drawn with is the OFF exposure (no token); the press answers the ON exposure WITH the token.
    let exposure: InboundExposure = { enabled: false, port: null };
    const onToggle = async (enabled: boolean): Promise<{ ok: boolean; message: string; exposure?: InboundExposure }> => {
      exposure = enabled ? { enabled: true, port: 51234, token: 'tok-first' } : { enabled: false, port: null };
      return { ok: true, message: '', exposure };
    };
    draw({ exposure, onToggle });
    press();
    await settle();
    // Draw again with the SAME stale prop the card closed over; the token must still be shown, because it came from the
    // press's answer, not from a re-read of `inbound.exposure`.
    const after = draw({ exposure, onToggle });
    expect(after.html).toContain('data-inbound-address');
    expect(after.html).toContain('tok-first');
    expect(after.html).not.toContain('data-inbound-token-hidden');
  });

  it('a later read (no token) does not show a token — it is shown once', async () => {
    harness.cells.length = 0;
    // The excepted stale-prop bug: a card whose prop carries no token, and whose press answered none either.
    draw({ exposure: { enabled: true, port: 51234 }, onToggle: async () => ({ ok: true, message: '', exposure: { enabled: true, port: 51234 } }) });
    const after = draw({ exposure: { enabled: true, port: 51234 }, onToggle: async () => ({ ok: true, message: '', exposure: { enabled: true, port: 51234 } }) });
    expect(after.html).toContain('data-inbound-token-hidden');
  });

  it('REQ-MCP-120 (Minor, 2026-11-25): a toggle whose IPC call REJECTS still clears the busy state', async () => {
    harness.cells.length = 0;
    // The IPC call itself throws (a handler that threw, dispatched as `command.failed`): the promise rejects, and the
    // card must not be left with `busy` true — the switch would hang disabled forever.
    const onToggle = async (): Promise<{ ok: boolean; message: string }> => { throw new Error('command.failed'); };
    draw({ exposure: { enabled: false, port: null }, onToggle });
    press();
    await settle();
    await settle();
    // Re-render with the cell state the rejection left; the switch must NOT be disabled, and the failure is shown.
    const after = draw({ exposure: { enabled: false, port: null }, onToggle });
    const toggleEl = harness.elements.find((e) => e.props['data-inbound-toggle'] !== undefined);
    expect(toggleEl?.props['disabled']).toBe(false);
    expect(after.html).toContain('command.failed');
  });
});
