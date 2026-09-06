import { describe, expect, it, vi } from 'vitest';
import { CONTRACT_SCHEMA_VERSION, NoticeActionSchema, type AcknowledgementPublish, type Notice, type NoticeCurrent } from '@rotaris/contracts';
import { createNoticeStore, type NoticeRecord, type NoticeStoreDeps } from './notices.js';

/**
 * ADR-0049's decision, tested where it is enforced: one serialised chain, record-then-render, compare-and-clear, and
 * the run-start clear that exempts a notice about another session.
 */
function harness(overrides: Partial<NoticeStoreDeps> = {}) {
  const broadcasts: (Notice | null)[] = [];
  const acknowledgements: AcknowledgementPublish[] = [];
  const recorded: NoticeRecord[] = [];
  const logged: string[] = [];
  const order: string[] = [];
  let focused: string | null = null;
  const deps: NoticeStoreDeps = {
    broadcast: (c: NoticeCurrent) => { order.push(`broadcast:${c.current ? c.current.id : 'null'}`); broadcasts.push(c.current); },
    pushAcknowledgement: (a) => { acknowledgements.push(a); },
    record: async (entry) => { order.push(`record:${entry.noticeId}`); recorded.push(entry); return true; },
    log: (line) => { logged.push(line); },
    focusedSession: () => focused,
    ...overrides,
  };
  const store = createNoticeStore(deps);
  return { store, broadcasts, acknowledgements, recorded, logged, order, focus: (id: string | null) => { focused = id; } };
}

describe('the notice store — REQ-NOTIFY-024/025/027/033, ADR-0049 decisions 1–3', () => {
  it('hands out increasing identifiers and keeps the most recent publication current', async () => {
    const h = harness();
    const a = await h.store.report({ severity: 'info', title: 'first' });
    const b = await h.store.report({ severity: 'info', title: 'second' });
    expect([a.id, b.id]).toEqual([1, 2]);
    expect(h.store.current()).toMatchObject({ id: 2, title: 'second' });
    expect(h.broadcasts.map((n) => n?.title)).toEqual(['first', 'second']);
  });

  it('applies a burst published in one turn in acceptance order, and the last of it is what stays on screen', async () => {
    const h = harness();
    const ids = await Promise.all([
      h.store.report({ severity: 'warning', title: 'one', sessionId: 's1' }),
      h.store.report({ severity: 'info', title: 'two' }),
      h.store.report({ severity: 'error', title: 'three', sessionId: 's1' }),
    ]);
    expect(ids.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(h.broadcasts.map((n) => n?.title)).toEqual(['one', 'two', 'three']);
    expect(h.store.current()?.title).toBe('three');
  });

  it('RECORDS a warning or an error before it renders it, and records neither info nor success (REQ-NOTIFY-268)', async () => {
    const h = harness();
    await h.store.report({ severity: 'warning', title: 'hooks need attention', detail: 'why', sessionId: 's1' });
    await h.store.report({ severity: 'info', title: 'all is well', sessionId: 's1' });
    await h.store.report({ severity: 'success', title: 'backed up', sessionId: 's1' });
    await h.store.report({ severity: 'error', title: 'it failed', message: 'body', detail: 'trace', sessionId: 's1' });
    expect(h.recorded.map((e) => e.title)).toEqual(['hooks need attention', 'it failed']);
    expect(h.recorded[1]).toMatchObject({ severity: 'error', message: 'body', detail: 'trace', sessionId: 's1' });
    // The whole point of the ordering: the record happens on the far side of the boundary BEFORE the broadcast.
    expect(h.order).toEqual(['record:1', 'broadcast:1', 'broadcast:2', 'broadcast:3', 'record:4', 'broadcast:4']);
  });

  it('records a notice superseded within the same turn, so replacement never loses a failure (ADR-0049\'s first execution)', async () => {
    const h = harness();
    const both = Promise.all([
      h.store.report({ severity: 'warning', title: 'Hooks need attention', detail: 'the advisory', sessionId: 's1' }),
      h.store.report({ severity: 'info', title: 'The run completed', sessionId: 's1' }),
    ]);
    await both;
    expect(h.store.current()?.title).toBe('The run completed');
    expect(h.recorded.map((e) => e.title)).toEqual(['Hooks need attention']);
  });

  it('takes the focused run for an unscoped notice, and falls back to the diagnostics where no session applies', async () => {
    const h = harness();
    h.focus('focused-session');
    await h.store.report({ severity: 'error', title: 'scoped by focus' });
    expect(h.recorded[0]).toMatchObject({ sessionId: 'focused-session' });
    h.focus(null);
    await h.store.report({ severity: 'error', title: 'nothing to scope to' });
    expect(h.recorded).toHaveLength(1);
    expect(h.logged.some((l) => l.includes('diagnostics') && l.includes('nothing to scope to') && l.includes('no session applies'))).toBe(true);
  });

  it('falls back to the diagnostics where the timeline refuses the entry, and still renders the notice', async () => {
    const h = harness({ record: async () => false });
    await h.store.report({ severity: 'error', title: 'refused entry', sessionId: 's9' });
    expect(h.logged.some((l) => l.includes('diagnostics') && l.includes('refused entry') && l.includes('the timeline refused'))).toBe(true);
    expect(h.store.current()?.title).toBe('refused entry');
  });
});

describe('clearing — REQ-NOTIFY-026/029/040/058', () => {
  it('compare-and-clear: dismissing a superseded identifier leaves its successor standing', async () => {
    const h = harness();
    const first = await h.store.report({ severity: 'info', title: 'first' });
    await h.store.report({ severity: 'info', title: 'second' });
    await h.store.dismiss(first.id);
    expect(h.store.current()?.title).toBe('second');
    await h.store.dismiss(2);
    expect(h.store.current()).toBeNull();
  });

  it('a clear with no identifier removes whatever is current', async () => {
    const h = harness();
    await h.store.report({ severity: 'info', title: 'anything' });
    await h.store.dismiss();
    expect(h.store.current()).toBeNull();
  });

  it('a starting run clears an unscoped notice and one scoped to itself, and spares one about another session', async () => {
    const h = harness();
    await h.store.report({ severity: 'info', title: 'unscoped' });
    await h.store.clearForRunStart('s1');
    expect(h.store.current()).toBeNull();

    await h.store.report({ severity: 'warning', title: 'about s2', sessionId: 's2' });
    await h.store.clearForRunStart('s1');
    expect(h.store.current()?.title).toBe('about s2');

    await h.store.clearForRunStart('s2');
    expect(h.store.current()).toBeNull();
  });

  it('gives the same outcome whichever order a start and a completion arrive in (REQ-NOTIFY-029)', async () => {
    const startThenNotice = harness();
    await startThenNotice.store.clearForRunStart('s1');
    await startThenNotice.store.report({ severity: 'warning', title: 'about s2', sessionId: 's2' });

    const noticeThenStart = harness();
    await noticeThenStart.store.report({ severity: 'warning', title: 'about s2', sessionId: 's2' });
    await noticeThenStart.store.clearForRunStart('s1');

    expect(startThenNotice.store.current()?.title).toBe('about s2');
    expect(noticeThenStart.store.current()?.title).toBe('about s2');
  });

  it('has no timer anywhere: nothing removes a notice but a replacement, a run start or a dismissal (REQ-NOTIFY-040)', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      await h.store.report({ severity: 'warning', title: 'stays', sessionId: 's1' });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(h.store.current()?.title).toBe('stays');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the two entry points — REQ-NOTIFY-003, ADR-0049 decision 5', () => {
  it('publishes a key once per application session and lets the rest through', async () => {
    const h = harness();
    const a = await h.store.report({ severity: 'warning', title: 'unreviewed hooks', key: 'hooks:w1', sessionId: 's1' });
    const b = await h.store.report({ severity: 'warning', title: 'unreviewed hooks', key: 'hooks:w1', sessionId: 's1' });
    const c = await h.store.report({ severity: 'warning', title: 'unreviewed hooks', key: 'hooks:w2', sessionId: 's1' });
    expect([a.shown, b.shown, c.shown]).toEqual([true, false, true]);
    expect(h.recorded).toHaveLength(2);
  });

  it('raises the transient beside the notice where the caller asks, and alone through `acknowledge`', async () => {
    const h = harness();
    await h.store.report({ severity: 'error', title: 'it failed', sessionId: 's1', acknowledge: { kind: 'fail', body: 'have a look' } });
    h.store.acknowledge('ok', 'Worktree deleted.');
    expect(h.acknowledgements).toEqual([
      { v: CONTRACT_SCHEMA_VERSION, kind: 'fail', title: 'it failed', body: 'have a look' },
      { v: CONTRACT_SCHEMA_VERSION, kind: 'ok', title: 'Worktree deleted.' },
    ]);
    // `acknowledge` publishes no notice and records nothing: it is the "reported nowhere else" half of REQ-NOTIFY-003.
    expect(h.store.current()?.title).toBe('it failed');
    expect(h.recorded).toHaveLength(1);
  });

  it('defaults a notice to persistent, and carries a non-persistent one without a dismiss control (REQ-NOTIFY-040)', async () => {
    const h = harness();
    await h.store.report({ severity: 'info', title: 'default' });
    expect(h.store.current()?.persistent).toBe(true);
    await h.store.report({ severity: 'info', title: 'not dismissible', persistent: false });
    expect(h.store.current()?.persistent).toBe(false);
  });
});

describe('the action vocabulary — REQ-NOTIFY-044, REQ-SHELL-115', () => {
  it('accepts each member with its parameter and refuses a member outside the union', () => {
    for (const action of [
      { kind: 'focus-session', sessionId: 's1' }, { kind: 'open-view', view: 'git' }, { kind: 'open-settings', category: 'models' },
      { kind: 'open-library', tab: 'artifacts' }, { kind: 'install-update' }, { kind: 'restart' }, { kind: 'retry-run' },
      { kind: 'save-settings' }, { kind: 'open-cloud-account' }, { kind: 'open-project-init', workspace: 'C:/w' },
      { kind: 'revert-proposal-review', id: 'p1' }, { kind: 'open-hook-review', workspace: 'C:/w' },
      { kind: 'open-provider-sign-in' }, { kind: 'open-provider-sign-in', provider: 'openrouter' },
    ]) expect(NoticeActionSchema.safeParse(action).success, JSON.stringify(action)).toBe(true);

    // A view outside REQ-SHELL-023, a library tab outside the two REQ-SHELL-115 names, an unknown member, a missing identity.
    expect(NoticeActionSchema.safeParse({ kind: 'open-view', view: 'terminal' }).success).toBe(false);
    expect(NoticeActionSchema.safeParse({ kind: 'open-library', tab: 'prompts' }).success).toBe(false);
    expect(NoticeActionSchema.safeParse({ kind: 'delete-everything' }).success).toBe(false);
    expect(NoticeActionSchema.safeParse({ kind: 'focus-session' }).success).toBe(false);
    // ESC-34: both members added on 2026-09-06 carry their object — the review always, the setup where one is named.
    expect(NoticeActionSchema.safeParse({ kind: 'open-hook-review' }).success).toBe(false);
    expect(NoticeActionSchema.safeParse({ kind: 'open-hook-review', workspace: '' }).success).toBe(false);
    expect(NoticeActionSchema.safeParse({ kind: 'open-provider-sign-in', provider: '' }).success).toBe(false);
  });

  it('carries the one action through to the notice on screen', async () => {
    const h = harness();
    await h.store.report({ severity: 'error', title: 'no model', action: { label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } } });
    expect(h.store.current()?.action).toEqual({ label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } });
  });
});
