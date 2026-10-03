import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * REQ-CONFIG-419 — the repair of `docs/defects/fixed/two-quick-configuration-reloads-mark-settings-unsaved.md`. The Settings
 * hook mounts under Electron, with a preload no `node` test environment reaches, so what pins it is its source: every
 * adoption of a snapshot is one functional update of the form that holds the saved and pending halves together, folded
 * through `adoptSnapshot` (whose rebasing `config-state.test.ts` pins). The unrepaired hook read the previous saved values
 * from a ref refreshed by an effect after render, so a second `config:changed` landing before that effect ran was rebased
 * against the values from before the first; `pnpm settings-proof` launch 11′ (`reload-last-write`) shows it in the built app.
 */
describe('REQ-CONFIG-419: the Settings hook adopts every snapshot in one update of the whole form', () => {
  const text = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  it('folds each adoption through adoptSnapshot against the form the previous one left', () => {
    expect(text).toContain('setForm((current) => adoptSnapshot(current, fresh, keepPending));');
  });
  it('keeps no saved or pending state of its own beside the form, and no ref an effect refreshes', () => {
    expect(text).not.toMatch(/\bsavedRef\b/);
    expect(text).not.toMatch(/\bsetSaved\b/);
    expect(text).not.toMatch(/\bsetPending\b/);
  });
});
