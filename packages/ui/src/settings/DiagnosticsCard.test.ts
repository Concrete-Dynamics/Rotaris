import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DiagnosticsCardState } from '@rotaris/contracts';
import { AboutSettings } from './About.js';
import { DIAGNOSTICS_TAKES_EFFECT, DiagnosticsCard, captureSentence } from './DiagnosticsCard.js';

/**
 * REQ-SHELL-163: the About tab's diagnostics card — three named, keyboard-reachable controls; the level offers exactly the
 * three and shows `off` where nothing is stored; the folder in force as selectable text; the run directory's open enabled
 * only while this window has one; and the words saying a change reaches windows opened afterwards.
 */
const ok = async () => ({ ok: true as const });
const draw = (state: DiagnosticsCardState | null) => renderToStaticMarkup(createElement(DiagnosticsCard, { state, onLevel: ok, onChooseFolder: ok, onOpenRunDirectory: ok }));
const OFF: DiagnosticsCardState = { level: 'off', folder: 'C:\\ws\\.rotaris\\diagnostics\\rotaris', folderChosen: false, capture: { state: 'off' } };
const decoded = (html: string) => html.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');

describe('REQ-SHELL-163: the diagnostics card', () => {
  it('names the level control "Diagnostics capture" and offers exactly off, light and deep', () => {
    const html = draw(OFF);
    expect(html).toMatch(/<select[^>]*aria-label="Diagnostics capture"/);
    expect([...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])).toEqual(['off', 'light', 'deep']);
  });

  it('shows off when nothing is stored, and before main has answered', () => {
    for (const html of [draw(OFF), draw(null)]) expect(html).toMatch(/<option value="off" selected="">/);
  });

  it('shows the folder in force as selectable text in a control named "Diagnostics output folder"', () => {
    const field = /<input[^>]*aria-label="Diagnostics output folder"[^>]*>/.exec(draw(OFF))?.[0] ?? '';
    expect(field).toContain('readOnly=""');
    expect(field).toContain(`value="${OFF.folder ?? ''}"`);
    expect(field).not.toContain('tabindex="-1"');
  });

  it('enables the open of the run directory only while this window has one', () => {
    const button = (html: string) => /<button[^>]*data-testid="diagnostics-open-run"[^>]*>/.exec(html)?.[0] ?? '';
    expect(button(draw(OFF))).toContain('disabled=""');
    expect(button(draw({ ...OFF, level: 'light', capture: { state: 'inactive', level: 'light', reason: 'unwritable' } }))).toContain('disabled=""');
    const active = draw({ ...OFF, level: 'light', capture: { state: 'active', level: 'light', runDirectory: 'C:\\out\\20261103T101112Z-42' } });
    expect(button(active)).not.toContain('disabled');
    expect(button(active)).toContain('aria-label="Open this window&#x27;s diagnostics run directory"');
  });

  it('says in words that a change reaches windows opened afterwards, not the capture running here', () => {
    expect(decoded(draw(OFF))).toContain(DIAGNOSTICS_TAKES_EFFECT);
    expect(DIAGNOSTICS_TAKES_EFFECT).toMatch(/windows opened from now on/);
  });

  it('says what this window\'s capture is doing, an inactive one with its reason', () => {
    expect(captureSentence({ ...OFF, capture: { state: 'active', level: 'deep', runDirectory: 'D:\\r' } })).toBe('This window captures at deep into D:\\r.');
    expect(captureSentence({ ...OFF, capture: { state: 'inactive', level: 'light', reason: 'the folder is read-only.' } })).toContain('the folder is read-only.');
  });

  it('is drawn on the About page when the root offers it, and not otherwise', () => {
    const about = (diagnostics: boolean) => renderToStaticMarkup(createElement(AboutSettings, {
      info: null, onOpenExternal: ok, onOpenThirdPartyLicenses: ok,
      ...(diagnostics ? { diagnostics: { state: OFF, onLevel: ok, onChooseFolder: ok, onOpenRunDirectory: ok } } : {}),
    }));
    expect(about(true)).toContain('data-testid="diagnostics-card"');
    expect(about(false)).not.toContain('data-testid="diagnostics-card"');
  });
});
