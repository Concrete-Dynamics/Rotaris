import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Notice, UpdateState } from '@rotaris/contracts';
import { NoticeBanner } from './Notice.js';
import { UpdateIndicator, updateIndicatorAction, updateIndicatorDescription, updateIndicatorLabel, updatePhaseAnnouncement } from './UpdateIndicator.js';

/**
 * PD-SHELL-018 (R-117) — the title bar's update indicator, `docs/design/briefs/title-bar-and-rail.md` R2 and R3: present while
 * a download runs and while a verified update waits, absent otherwise; its words are the brief's §6 and §7, character for
 * character; its action is the notice's own member. And REQ-NOTIFY-043's meter on the notice (the notice-banner brief §3.1).
 */
const markup = (state: UpdateState, currentNoticeId: number | null = null): string => renderToStaticMarkup(createElement(UpdateIndicator, { state, currentNoticeId }));
const decoded = (html: string): string => html.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');

const downloading: UpdateState = { phase: 'downloading', version: '0.2.0', measured: '41%', noticeId: 1 };
const ready: UpdateState = { phase: 'ready', version: '0.2.0', inPlace: true, noticeId: 1 };

describe('PD-SHELL-018 — the update indicator\'s states', () => {
  it('is absent at rest and present while downloading or ready', () => {
    expect(markup({ phase: 'none', noticeId: null })).toBe('');
    expect(markup({ phase: 'none', noticeId: 4 })).toBe('');
    expect(markup(downloading)).toContain('data-testid="update-indicator"');
    expect(markup(downloading)).toContain('data-phase="downloading"');
    expect(markup(ready)).toContain('data-phase="ready"');
  });

  it('downloading: `Downloading {version}`, the `{measured}` figure in the mono face, and `Cancel` dispatching the notice\'s cancel member', () => {
    const html = decoded(markup(downloading));
    expect(updateIndicatorLabel(downloading)).toBe('Downloading 0.2.0');
    expect(html).toMatch(/<span class="update-indicator__label"[^>]*>Downloading 0\.2\.0<\/span>/);
    expect(html).toContain('<span class="update-indicator__figure mono">41%</span>');
    expect(html).toContain('ph-download-simple');
    expect(html).toContain('data-action="cancel-update"');
    expect(html).toMatch(/>Cancel<\/button>/);
    expect(updateIndicatorAction(downloading).action).toEqual({ kind: 'cancel-update' });
  });

  it('ready: `{version} ready` and `Restart now` dispatching the notice\'s restart member', () => {
    const html = decoded(markup(ready));
    expect(updateIndicatorLabel(ready)).toBe('0.2.0 ready');
    expect(html).toMatch(/<span class="update-indicator__label"[^>]*>0\.2\.0 ready<\/span>/);
    expect(html).not.toContain('update-indicator__figure');
    expect(html).toContain('ph-arrow-circle-up');
    expect(html).toContain('data-action="restart"');
    expect(html).toMatch(/>Restart now<\/button>/);
  });

  it('carries the accessible name `Update status` and the §7 descriptions, which are also its tooltip (REQ-SHELL-058)', () => {
    const html = decoded(markup(downloading));
    expect(html).toContain('aria-label="Update status"');
    expect(updateIndicatorDescription(downloading)).toBe('Downloading Rotaris 0.2.0: 41%. You can keep working; it is verified against the published checksum when it finishes.');
    expect(html).toContain(`title="${updateIndicatorDescription(downloading)}"`);
    expect(updateIndicatorDescription(ready)).toBe('Rotaris 0.2.0 has been downloaded, verified and installed. It runs the next time Rotaris starts, or now with Restart now.');
    expect(updateIndicatorDescription({ ...ready, inPlace: false })).toBe('Rotaris 0.2.0 has been downloaded and verified. It installs the next time Rotaris starts, or now with Restart now.');
  });

  it('names its two actions as §7 does', () => {
    expect(updateIndicatorAction(downloading)).toMatchObject({ name: 'Cancel the update download', description: 'Stops the download of Rotaris 0.2.0 and removes what it wrote. It downloads again the next time Rotaris starts.' });
    expect(updateIndicatorAction(ready)).toMatchObject({ name: 'Restart now', description: 'Restarts Rotaris to run 0.2.0. You are asked first about unsaved settings, a running integration and active runs.' });
    expect(updateIndicatorAction({ ...ready, inPlace: false }).description).toBe('Restarts Rotaris to install 0.2.0. You are asked first about unsaved settings, a running integration and active runs.');
    const html = decoded(markup(downloading));
    expect(html).toContain('aria-label="Cancel the update download"');
    expect(html).toContain('aria-description="Stops the download of Rotaris 0.2.0 and removes what it wrote. It downloads again the next time Rotaris starts."');
  });

  it('is never a live region for its figure; a phase change has its own hidden status, empty until a change the banner does not say', () => {
    const html = markup(downloading);
    expect(html).not.toMatch(/class="update-indicator"[^>]*role="status"/);
    expect(html).toContain('role="status" data-testid="update-announcement"></span>');
    expect(updatePhaseAnnouncement(ready)).toBe('Rotaris 0.2.0 is ready. Restart now is in the title bar.');
  });

  it('draws no box, no fill and no motion; only the icon carries colour (the brief §8)', () => {
    const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
    const rules = [...css.matchAll(/\.update-indicator[^{]*\{([^}]+)\}/g)].map((m) => m[1] ?? '').join(' ');
    expect(rules).not.toMatch(/background|border|animation|box-shadow/);
    expect(rules).toContain('color: var(--rt-run)');
    expect(rules).toContain('color: var(--rt-done)');
    expect(rules).toContain('-webkit-app-region: no-drag');
    expect(markup(downloading)).not.toContain('is-pulsing');
  });
});

describe('REQ-NOTIFY-043 — the download notice\'s meter (the notice-banner brief §3.1, §6)', () => {
  const notice = (over: Partial<Notice>): Notice => ({ id: 1, severity: 'info', title: 'Downloading Rotaris 0.2.0', message: '41% — verifying against the published checksum when it finishes.', detail: '', persistent: true, sessionId: '', action: { label: 'Cancel download', action: { kind: 'cancel-update' } }, ...over });

  it('draws a meter named `{percent}% downloaded` under the message while the notice carries a progress figure', () => {
    const html = renderToStaticMarkup(createElement(NoticeBanner, { notice: notice({ progress: 41 }) }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="41% downloaded"');
    expect(html).toContain('aria-valuenow="41"');
    expect(html.indexOf('notice-message')).toBeLessThan(html.indexOf('notice-meter'));
  });

  it('draws none where the size is unknown, and keeps the Dismiss beside `Cancel download` (UD-3, OQ-552)', () => {
    const html = renderToStaticMarkup(createElement(NoticeBanner, { notice: notice({ message: '12 MB — verifying against the published checksum when it finishes.' }) }));
    expect(html).not.toContain('role="meter"');
    expect(html).toContain('data-action="cancel-update"');
    expect(html).toContain('notice__dismiss');
  });
});

describe('PD-STARTUP-014 — the link-only notice\'s action (the notice-banner brief §6 row 5)', () => {
  const notice = (over: Partial<Notice>): Notice => ({ id: 2, severity: 'info', title: 'Rotaris 0.2.0 is available', message: 'Faster startup', detail: '', persistent: true, sessionId: '', action: { label: 'Open release page', action: { kind: 'open-release-page' } }, ...over });

  it('draws `Open release page` with the arrow that marks leaving for the browser after it, hidden from the accessible name', () => {
    const html = renderToStaticMarkup(createElement(NoticeBanner, { notice: notice({}) }));
    expect(html).toContain('data-action="open-release-page"');
    expect(html).toMatch(/Open release page <i class="ph ph-arrow-square-out" aria-hidden="true"><\/i><\/button>/);
    expect(html).toContain('notice__dismiss');
  });

  it('draws no action where the page was refused, and no arrow on any other action', () => {
    const { action: _withheld, ...rest } = notice({});
    const withheld = renderToStaticMarkup(createElement(NoticeBanner, { notice: rest }));
    expect(withheld).not.toContain('data-action=');
    expect(withheld).toContain('notice__dismiss');
    const offer = renderToStaticMarkup(createElement(NoticeBanner, { notice: notice({ action: { label: 'Update now', action: { kind: 'install-update' } } }) }));
    expect(offer).not.toContain('ph-arrow-square-out');
  });
});
