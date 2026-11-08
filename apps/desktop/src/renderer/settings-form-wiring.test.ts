import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * REQ-CONFIG-419 — the repair of `docs/archive/defects/two-quick-configuration-reloads-mark-settings-unsaved.md`. The Settings
 * hook mounts under Electron, with a preload no `node` test environment reaches, so what pins it is its source: every
 * adoption of a snapshot is one functional update of the form that holds the saved and pending halves together, folded
 * through `adoptSnapshot` (whose rebasing `config-state.test.ts` pins). The unrepaired hook read the previous saved values
 * from a ref refreshed by an effect after render, so a second `config:changed` landing before that effect ran was rebased
 * against the values from before the first; `pnpm settings-proof` launch 11′ (`reload-last-write`) shows it in the built app.
 *
 * This is a guard on source text, not on behaviour: a refactor that keeps these lines could reintroduce the race, and a
 * harmless rename turns it red. The behaviour is pinned by `adoptSnapshot`'s case in
 * `packages/ui/src/settings/config-state.test.ts` and by launch 11′; replace this file with a mounted test of the hook if
 * the hook ever becomes mountable under a test environment.
 */
/** The hook's source, read once: both describes below guard the same file. */
const text = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('REQ-CONFIG-419: the Settings hook adopts every snapshot in one update of the whole form', () => {
  it('folds each adoption through adoptSnapshot against the form the previous one left', () => {
    expect(text).toContain('setForm((current) => adoptSnapshot(current, fresh, keepPending));');
  });
  it('keeps no saved or pending state of its own beside the form, and no ref an effect refreshes', () => {
    expect(text).not.toMatch(/\bsavedRef\b/);
    expect(text).not.toMatch(/\bsetSaved\b/);
    expect(text).not.toMatch(/\bsetPending\b/);
    expect(text).not.toMatch(/\bpendingRef\b/);
  });
  it('saves the pending half against the saved half of the same form', () => {
    expect(text).toContain('savePayload(current.saved, current.pending)');
  });
});

/**
 * ADR-0037 Tier B / REQ-CONFIG-262 with REQ-CONFIG-288 and REQ-TOOLS-077 — the repair of
 * `docs/defects/a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md`.
 *
 * The hook publishes the live state the run host overlays at the next run start, and it must also LET GO when the
 * screen unmounts: left standing it is a snapshot of a form nobody is looking at, and the overlay outranks the file,
 * so the composer's own durable permission-mode write was put back to the mode the abandoned form held.
 *
 * Which window owns the run host's one live state — and what a window's DOCUMENT going means, since a close runs no
 * React cleanup — is main's rule, pinned by `../main/live-state.test.ts` and by `pnpm mode-reset-proof` in the built
 * app. What this guards is that the hook keeps publishing and letting go at all, which a refactor could quietly drop.
 */
describe('REQ-CONFIG-262: the Settings hook publishes its live state and lets go when the screen goes', () => {
  it('publishes the screen\'s values on every pending change', () => {
    expect(text).toContain("useEffect(() => { if (pending) void bridge.command({ kind: 'config.liveState', state: liveStateOf(pending) }); }, [pending]);");
  });
  it('lets go with an EMPTY state in the effect\'s cleanup, so an abandoned form cannot outrank a durable write', () => {
    expect(text).toContain("useEffect(() => () => { void bridge.command({ kind: 'config.liveState', state: {} }); }, []);");
  });
});
