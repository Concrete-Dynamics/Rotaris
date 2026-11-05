import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DiagnosticsCardState } from '@rotaris/contracts';
import { AboutSettings } from './About.js';
import { DIAGNOSTICS_LOG_EXCLUDES, DIAGNOSTICS_LOG_INCLUDES, DIAGNOSTICS_LOG_SCOPE, DIAGNOSTICS_TAKES_EFFECT, DiagnosticsCard, captureSentence, fallbackSentence } from './DiagnosticsCard.js';

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
    expect(field).toContain(`value="${OFF.folder}"`);
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

  it('says in words what a run directory holds, at every level (PD-STARTUP-011)', () => {
    for (const level of ['off', 'light', 'deep'] as const) {
      const html = decoded(draw({ ...OFF, level }));
      expect(html).toContain(DIAGNOSTICS_LOG_SCOPE);
      expect(html).toContain(DIAGNOSTICS_LOG_INCLUDES);
      expect(html).toContain(DIAGNOSTICS_LOG_EXCLUDES);
    }
    expect(DIAGNOSTICS_LOG_SCOPE).toMatch(/this application's log for every open window/);
    expect(DIAGNOSTICS_LOG_INCLUDES).toMatch(/folder paths and error messages/);
    expect(DIAGNOSTICS_LOG_EXCLUDES).toMatch(/no conversation, model output or file contents/);
  });

  it('shows the per-user default as the folder in force for a window with no workspace (PD-STARTUP-011)', () => {
    const perUser = '/home/u/.local/share/rotaris/diagnostics/rotaris';
    const html = decoded(draw({ ...OFF, level: 'light', folder: perUser, folderChosen: false }));
    expect(/<input[^>]*aria-label="Diagnostics output folder"[^>]*>/.exec(html)?.[0]).toContain(`value="${perUser}"`);
    expect(html).toMatch(/Output folder \(the default\)/);
    expect(html).not.toMatch(/No folder/);
  });

  it('says in words that the workspace\'s own folder could not be written, and names the cause, where the per-user folder was taken (PD-STARTUP-011 revision 2)', () => {
    const perUser = 'C:\\Users\\u\\AppData\\Roaming\\Rotaris\\diagnostics\\rotaris';
    const fallback = { from: 'C:\\notes.txt\\.rotaris\\diagnostics\\rotaris', cause: 'C:\\notes.txt is not an existing folder' };
    const state: DiagnosticsCardState = { ...OFF, level: 'light', folder: perUser, fallback, capture: { state: 'active', level: 'light', runDirectory: `${perUser}\\20261104T101112Z-42` } };
    const sentence = fallbackSentence(state);
    expect(sentence).toMatch(/workspace's own folder could not be written/);
    expect(sentence).toContain(fallback.cause);
    expect(sentence).toContain('per-user folder');
    const html = decoded(draw(state));
    expect(html).toContain(`data-testid="diagnostics-fallback">${sentence}</p>`);
    expect(/<input[^>]*aria-label="Diagnostics output folder"[^>]*>/.exec(html)?.[0]).toContain(`value="${perUser}"`);
  });

  it('never says the diagnostics go to the per-user folder where that folder could not be created either and the capture is inactive (PD-STARTUP-011 revision 2)', () => {
    const perUser = 'C:\\blocked\\diagnostics\\rotaris';
    const fallback = { from: 'C:\\notes.txt\\.rotaris\\diagnostics\\rotaris', cause: 'C:\\notes.txt is not an existing folder' };
    const reason = `Diagnostics could not create a run directory in ${perUser}: ENOTDIR, after the workspace's own folder ${fallback.from} could not be written (${fallback.cause}). This window opened without them.`;
    const state: DiagnosticsCardState = { ...OFF, level: 'light', folder: perUser, fallback, capture: { state: 'inactive', level: 'light', reason } };
    const sentence = fallbackSentence(state);
    expect(sentence).toMatch(/workspace's own folder could not be written/);
    expect(sentence).toContain(fallback.cause);
    expect(sentence).toContain('tried the per-user folder');
    expect(sentence).not.toMatch(/diagnostics go to/);
    const html = decoded(draw(state));
    expect(html).toContain(`data-testid="diagnostics-fallback">${sentence}</p>`);
    expect(html).toContain(`data-testid="diagnostics-capture">${captureSentence(state)}</p>`);
    expect(captureSentence(state)).toContain(perUser);
  });

  it('says nothing of a fallback where the window took its workspace\'s own folder', () => {
    expect(fallbackSentence(OFF)).toBe('');
    expect(fallbackSentence(null)).toBe('');
    expect(draw(OFF)).not.toContain('data-testid="diagnostics-fallback"');
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
