import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * B2 (2026-11-09), REQ-MCP-110/111: the guided `web_search` card's presses reach the window's ONE bridge. The card
 * itself takes the handler set as a prop (`McpSettingsProps.webSearchSetup`) and holds no bridge — `useMcp` is what
 * binds it (`bindWebSearchSetup` over `bridge.command`), and the command kinds each press sends are pinned where they
 * are decided (`packages/ui/src/settings/web-search-press.test.ts`). This file pins the WIRING the source holds: the
 * binder is the one handed to the card, and `SettingsView` passes the same `mcp` props through. The roots mount under
 * Electron, so — as `agent-links-wiring.test.ts` and its siblings do — what pins them is their source.
 */
const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

describe('B2 wiring: the guided card\'s presses reach this window\'s bridge', () => {
  it('useMcp binds the five presses with bindWebSearchSetup over bridge.command and the category\'s own re-read — fails if the binder is dropped, a second binder is written, or the re-read stops reporting its outcome or the card\'s secrets view', () => {
    const main = source('main.tsx');
    // Round-3 Minor: the re-read answers its OUTCOME (`readAfterWebSearchWrite`), so a refused read reaches the card
    // as words instead of resolving as a refresh that never happened.
    expect(main).toContain('webSearchSetup: bindWebSearchSetup({ command: (req) => bridge.command(req), read: readAfterWebSearchWrite })');
    expect(main).toContain('const readAfterWebSearchWrite = useCallback(async () => {');
    expect(main).toContain('for (const r of answers) if (!r.ok) return { ok: false as const, message: r.message };');
    // The binder is imported from the package that owns the presses, never re-derived here.
    expect(main).toContain('bindWebSearchSetup');
    expect(main.match(/bindWebSearchSetup\(/g)).toHaveLength(1);
  });

  it('Minor 2: the guided card\'s own secrets view is read with server web_search, apart from the chooser\'s — fails if the card is fed the chooser-filtered view (a chooser naming another server would blank the stored-key state and its delete action)', () => {
    const main = source('main.tsx');
    // The card's view exists, is read with the card's own server, and is what `useMcp` hands the props.
    expect(main).toContain("{ kind: 'mcp.secrets', server: 'web_search' }");
    expect(main).toContain('readWebSearchSecrets');
    expect(main).toContain('secrets, webSearchSecrets,');
    expect(main).toContain('onRefresh: () => { void read(); void readSecrets(secretsServer); void readWebSearchSecrets(); },');
    // Both reads run at mount and on the configuration change, and the card's is refreshed after every write.
    expect(main.match(/readWebSearchSecrets/g)!.length).toBeGreaterThanOrEqual(5);
    // And the card reads ITS view, never the chooser's, for the stored key (McpSettings.tsx).
    const card = readFileSync(new URL('../../../../packages/ui/src/settings/McpSettings.tsx', import.meta.url), 'utf8');
    expect(card).toContain('webSearchStoredKey(props.webSearchSecrets)');
    expect(card).not.toContain('webSearchStoredKey(props.secrets)');
  });

  it('the mcp category is handed the props, with the fatal snapshot folded in as Skills does (REQ-CONFIG-478) — fails if the card is starved of the props or a fatal load is hidden from it', () => {
    const main = source('main.tsx');
    expect(main).toContain('mcp={{ ...mcp, ...(config.snapshot && !config.snapshot.loadOk ? { fatal: config.snapshot } : {}) }}');
    const settingsView = readFileSync(new URL('../../../../packages/ui/src/SettingsView.tsx', import.meta.url), 'utf8');
    expect(settingsView).toContain('<McpSettings {...mcp} />');
  });
});
