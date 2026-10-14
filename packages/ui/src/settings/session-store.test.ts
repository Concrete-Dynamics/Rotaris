import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsView } from '../SettingsView.js';

/**
 * OQ-281 (ruled 2026-10-14 under R-072), REQ-SESSION-202: Settings › Project › Session store is where a place holding no store
 * is resolved. "Start a new session store…" sits beside "Restore session store…" while — and only while — the window's open
 * holds `workspace.store-missing`; the restore stays enabled there, and its hint says what restoring does to the found place.
 */
const ok = async () => ({ ok: true as const });
const render = (storeMissing: boolean) => renderToStaticMarkup(createElement(SettingsView, {
  session: null, workspace: '/work/a', onBackup: ok, onRestore: ok, initialCategory: 'project', storeMissing, onEstablishStore: ok,
}));

describe('Settings › Project › Session store under a place holding no store (OQ-281)', () => {
  it('offers the new store beside the restore, after it, with the restore still enabled', () => {
    const html = render(true);
    expect(html).toContain('Start a new session store…');
    expect(html.indexOf('Restore session store…')).toBeLessThan(html.indexOf('Start a new session store…'));
    expect(html).toMatch(/<button[^>]*class="[^"]*btn btn-secondary[^"]*"[^>]*>Restore session store…<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Restore session store…/);
    expect(html).toContain('recovers nothing that may have been there');
    expect(html).toContain('Restoring moves what is in that place aside, keeps it, and puts the backup&#x27;s sessions there.');
  });

  it('offers no such action while the store opened', () => {
    const html = render(false);
    expect(html).toContain('Restore session store…');
    expect(html).not.toContain('Start a new session store');
    expect(html).toContain('the previous store is kept');
  });
});
