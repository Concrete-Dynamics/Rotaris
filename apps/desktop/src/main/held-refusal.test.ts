import { describe, expect, it } from 'vitest';
import type { CommandOutcome } from '@rotaris/contracts';
import { answerUnderHeldRefusal } from './store-notice.js';

/**
 * OQ-281 (ruled 2026-10-14 under R-072), REQ-SESSION-202 / REQ-SESSION-089: every workspace-scoped refusal in a window whose
 * store the open refused states the held condition. The gates answer `workspace.none` from the window's missing identifier;
 * `runCommand` (`index.ts`) passes every answer through this before it leaves main
 * (`docs/defects/fixed/a-refused-store-is-reported-as-no-workspace-by-every-command-but-the-listing.md`).
 */
const held = { code: 'workspace.store-missing', headline: 'The session store for this workspace is not where it is kept', detail: 'The place … exists and the store is not in it.' };
const none = (headline: string): CommandOutcome => ({ ok: false, code: 'workspace.none', headline });

describe('a workspace-scoped refusal in a window holding a refused store (OQ-281)', () => {
  it('a "no workspace" answer becomes the held condition, whichever gate gave it', () => {
    for (const headline of ['Open a workspace before reading its configuration', 'Open a workspace first', 'No workspace is open', 'The workspace service is not running']) {
      expect(answerUnderHeldRefusal(none(headline), { workspaceId: undefined }, held)).toEqual({ ok: false, code: held.code, headline: held.headline, detail: held.detail });
    }
  });

  it('leaves every other answer alone: a success, another refusal, no refusal held, or a window whose store opened', () => {
    const okOutcome: CommandOutcome = { ok: true, value: { x: 1 } };
    const other: CommandOutcome = { ok: false, code: 'run.active', headline: 'Finish the active run first.' };
    expect(answerUnderHeldRefusal(okOutcome, { workspaceId: undefined }, held)).toBe(okOutcome);
    expect(answerUnderHeldRefusal(other, { workspaceId: undefined }, held)).toBe(other);
    expect(answerUnderHeldRefusal(none('Open a workspace first'), { workspaceId: undefined }, undefined)).toEqual(none('Open a workspace first'));
    expect(answerUnderHeldRefusal(none('Open a workspace first'), { workspaceId: 'v1-x' }, held)).toEqual(none('Open a workspace first'));
  });
});
