import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION, type Notice } from '@rotaris/contracts';
import { createNoticeStore } from './notices.js';
import { CONFIG_FATAL_MESSAGE, CONFIG_FATAL_TITLE, ConfigFatalNotices } from './config-fatal-notice.js';

/**
 * OQ-279 (ruled 2026-10-13 under R-072): a workspace whose configuration fails to load opens with REQ-CONFIG-478's report raised
 * as a persistent error notice, keyed so it is raised once, and cleared once a later load of that workspace succeeds; a fault
 * that comes back after that clean load is raised again. Driven through the REAL notice store, so the keys, the single slot
 * and the compare-and-clear are the product's own.
 */
const REPORT = '/home/u/.config/rotaris/agents.yaml at hooks.entries.0.timeout_seconds (global scope): must be at least 1';
const OTHER = '/w/atlas/.rotaris/agents.yaml at runtime.max_depth (workspace scope): must be an integer';

function harness() {
  const shown: (Notice | null)[] = [];
  const logged: string[] = [];
  const store = createNoticeStore({
    broadcast: (c) => { expect(c.v).toBe(CONTRACT_SCHEMA_VERSION); shown.push(c.current); },
    pushAcknowledgement: () => undefined,
    record: async () => true,
    log: (line) => { logged.push(line); },
    focusedSession: () => null,
  });
  const fatal = new ConfigFatalNotices({
    report: (input) => store.report(input),
    dismiss: (id) => store.dismiss(id),
    action: { label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } },
    log: (line) => { logged.push(line); },
  });
  return { store, fatal, shown, logged };
}

describe('the fatal configuration load raised when the workspace opens (OQ-279, REQ-CONFIG-478, REQ-NOTIFY-001)', () => {
  it('raises one persistent error notice naming the file, its scope and the key, with the step and the Settings action', async () => {
    const h = harness();
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: REPORT });
    const notice = h.store.current();
    expect(notice).toMatchObject({
      severity: 'error', title: CONFIG_FATAL_TITLE, message: CONFIG_FATAL_MESSAGE, detail: REPORT, persistent: true,
      action: { label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } },
    });
    expect(notice?.detail).toContain('(global scope)');
    expect(notice?.detail).toContain('hooks.entries.0.timeout_seconds');
    // Once: a second load reporting the same fault (a second window, a reread) publishes nothing more.
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: REPORT });
    expect(h.shown.filter((n) => n?.title === CONFIG_FATAL_TITLE)).toHaveLength(1);
  });

  it('clears the notice it raised once a later load of that workspace succeeds, and leaves a later notice standing', async () => {
    const h = harness();
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: REPORT });
    expect(h.store.current()?.title).toBe(CONFIG_FATAL_TITLE);
    await h.fatal.observe('/w/atlas', { loadOk: true, fatal: null });
    expect(h.store.current()).toBeNull();
    expect(h.logged.some((l) => l.includes('loaded again; the fatal-load notice'))).toBe(true);

    // Compare-and-clear: a notice that replaced it in the slot is not the one cleared.
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: OTHER });
    await h.store.report({ severity: 'warning', title: 'something else' });
    await h.fatal.loaded('/w/atlas');
    expect(h.store.current()?.title).toBe('something else');
  });

  it('raises the same fault again when it comes back after a clean load', async () => {
    const h = harness();
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: REPORT });
    await h.fatal.loaded('/w/atlas');
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: REPORT });
    expect(h.store.current()?.title).toBe(CONFIG_FATAL_TITLE);
    expect(h.shown.filter((n) => n?.title === CONFIG_FATAL_TITLE)).toHaveLength(2);
  });

  it('keeps each workspace to its own notice, and a clean load of one clears nothing of another', async () => {
    const h = harness();
    await h.fatal.observe('/w/atlas', { loadOk: false, fatal: REPORT });
    await h.fatal.observe('/w/other', { loadOk: true, fatal: null });
    expect(h.store.current()?.detail).toBe(REPORT);
    expect(ConfigFatalNotices.keyOf('/w/atlas', 0, REPORT)).toBe(`config.fatal:/w/atlas:0:${REPORT}`);
  });

  it('raises nothing for a workspace whose configuration loads', async () => {
    const h = harness();
    await h.fatal.observe('/w/atlas', { loadOk: true, fatal: null });
    expect(h.shown).toEqual([]);
  });
});
