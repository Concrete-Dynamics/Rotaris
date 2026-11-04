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
const render = (storeHeld: 'missing' | 'corrupt' | null) => renderToStaticMarkup(createElement(SettingsView, {
  session: null, workspace: '/work/a', onBackup: ok, onRestore: ok, initialCategory: 'project', storeHeld, onEstablishStore: ok,
}));

describe('Settings › Project › Session store under a place holding no store (OQ-281)', () => {
  it('offers the new store beside the restore, after it, with the restore still enabled', () => {
    const html = render('missing');
    expect(html).toContain('Start a new session store…');
    expect(html.indexOf('Restore session store…')).toBeLessThan(html.indexOf('Start a new session store…'));
    expect(html).toMatch(/<button[^>]*class="[^"]*btn btn-secondary[^"]*"[^>]*>Restore session store…<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Restore session store…/);
    expect(html).toContain('recovers nothing that may have been there');
    expect(html).toContain('Restoring moves what is in that place aside, keeps it, and puts the backup&#x27;s sessions there.');
  });

  it('offers no such action while the store opened', () => {
    const html = render(null);
    expect(html).toContain('Restore session store…');
    expect(html).not.toContain('Start a new session store');
    expect(html).not.toContain('Set the damaged store aside');
    expect(html).toContain('the previous store is kept');
  });
});

/**
 * OQ-477 (ruled 2026-11-04 under R-072): a store that failed its integrity check is resolved in the same place by REQ-SESSION-201's
 * restore and "Set the damaged store aside and start a new one…" (ADR-0058 part 11's step 4), offered beside it only while the
 * window's open holds `workspace.store-corrupt`; neither is the empty place's action.
 */
describe('Settings › Project › Session store under a store that failed its integrity check (OQ-477)', () => {
  it('offers the set-aside beside the restore, after it, with the restore still enabled and its hint saying what restoring does', () => {
    const html = render('corrupt');
    expect(html).toContain('Set the damaged store aside and start a new one…');
    expect(html).toContain('data-ui="settings-set-aside-store"');
    expect(html.indexOf('Restore session store…')).toBeLessThan(html.indexOf('Set the damaged store aside and start a new one…'));
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Restore session store…/);
    expect(html).toContain('The store failed its integrity check. Restoring moves the damaged store aside unchanged, keeps it, and puts the backup&#x27;s sessions in its place.');
    expect(html).toContain('It recovers nothing: the sessions in it will no longer be listed.');
    expect(html).not.toContain('Start a new session store…');
  });

  it('(counterfactual) the empty place offers its own action, not the set-aside', () => {
    const html = render('missing');
    expect(html).not.toContain('Set the damaged store aside');
  });
});
