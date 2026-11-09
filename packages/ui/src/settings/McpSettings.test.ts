import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { McpListing, McpServerRow } from '@rotaris/contracts';
import { McpSettings, type McpSettingsProps } from './McpSettings.js';

/**
 * PD-CONFIG-006 with REQ-MCP-115: the switch's words. A configured-off, AVAILABLE row's press is the DURABLE write
 * — the accessible name, the accessible description and the tooltip say so, and the row is the shipped `browser`'s
 * shape. An overridden row keeps REQ-MCP-115's session sentence verbatim (the packaged `mcp-proof` asserts it), and
 * an unavailable row keeps REQ-CONFIG-349's disabled switch with its reason.
 */
const listing = (over: Partial<McpServerRow> = {}): McpListing => ({
  configFile: '/ws/.rotaris/agents.yaml',
  rows: [{
    name: 'browser', type: 'stdio', line: 'npx -y @playwright/mcp@0.0.80 --headless', origin: 'default',
    enabled: false, overridden: false, available: true, availabilityDetail: '', unresolved: [], expectedKeys: [], ...over,
  }],
});

const render = (rows: McpListing) => renderToStaticMarkup(createElement(McpSettings, {
  listing: rows, loading: false, error: null, health: {}, probing: false,
  onRefresh: () => undefined, onProbeAll: async () => undefined,
  onToggle: async () => ({ ok: true, message: '' }),
  secrets: null, webSearchSecrets: null, onSecretsServer: () => undefined, setup: null,
  onSetupStart: async () => ({ ok: true, message: '' }), onSetupCancel: async () => undefined,
  // B2's guided card: this file's cases are about the ROW's switch, so the presses it never makes are inert.
  webSearchSetup: {
    onOpenFile: async () => ({ ok: true as const }),
    onGetKey: async () => ({ ok: true as const }),
    onStoreKey: async () => ({ ok: false as const, message: 'not pressed here' }),
    onDeleteKey: async () => ({ ok: false as const, message: 'not pressed here' }),
    onProbe: async () => ({ state: 'unknown' as const }),
  },
} satisfies McpSettingsProps));

describe('the configured-off, available row\'s switch (PD-CONFIG-006)', () => {
  it('names the durable write in its accessible name, description and tooltip — not a session toggle', () => {
    const html = render(listing());
    expect(html).toContain('aria-label="Enable browser"');
    expect(html).not.toContain('Enable browser for this session');
    expect(html).toContain('writes enabled: true to the configuration file');
    expect(html).toContain('persistent');
  });

  it('keeps REQ-MCP-115\'s session wording verbatim on an overridden row', () => {
    const html = render(listing({ enabled: true, overridden: true }));
    expect(html).toContain('aria-label="Enable browser for this session"');
    expect(html).toContain('Overridden for this session — not persistent. To make it durable, set enabled in the configuration file.');
  });

  it('an unavailable row stays disabled with its reason (REQ-CONFIG-349)', () => {
    const html = render(listing({ available: false, availabilityDetail: '' }));
    expect(html).toContain('disabled');
    expect(html).toContain('the command was not found on the executable search path');
    expect(html).not.toContain('writes enabled: true');
  });
});
