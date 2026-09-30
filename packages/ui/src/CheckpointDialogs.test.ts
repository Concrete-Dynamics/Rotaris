import { describe, expect, it } from 'vitest';
import { restoredNoticeBody, restoreSummary } from '@rotaris/contracts';
import { overwriteConsentLabel } from './CheckpointDialogs.js';

describe('the restore confirmation words each count with an agreeing noun (REQ-GIT-097, REQ-GIT-098, REQ-GIT-100, REQ-SHELL-044)', () => {
  it('the consent checkbox, the summary and the notice body read one file or change in the singular', () => {
    expect(overwriteConsentLabel(1)).toBe('Overwrite 1 uncommitted change');
    expect(overwriteConsentLabel(3)).toBe('Overwrite 3 uncommitted changes');
    expect(restoreSummary(2, 1, '/ws')).toMatch(/^This replaces 1 file in \/ws /);
    expect(restoreSummary(2, 4, '/ws')).toMatch(/^This replaces 4 files in \/ws /);
    expect(restoredNoticeBody(1, null)).toMatch(/^1 file changed\. /);
    expect(restoredNoticeBody(0, 3)).toMatch(/^0 files changed\. /);
  });
});
