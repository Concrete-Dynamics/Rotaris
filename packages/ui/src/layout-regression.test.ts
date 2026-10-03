import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { statusStripSandboxItem, stripItems, type StripFacts } from './composer.js';

const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  return [...css.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'g'))]
    .map((match) => match[1] ?? '').join(' ');
}

describe('minimum-window layout regressions', () => {
  it('lets the workspace action row wrap while retaining its left edge', () => {
    expect(rule('.composer__actions')).toContain('justify-content: flex-start');
    expect(rule('.composer__actions')).toContain('flex-wrap: wrap');
    expect(rule('.composer__chips')).toContain('flex-wrap: wrap');
  });

  it('shrinks the strip\'s path link and branch item from their measured basis with no end ellipsis (REQ-WORKSPACE-149 rule 2)', () => {
    // Before the repair both were ordinary items: `text-overflow: ellipsis` cut a deep path at its END and the folder name
    // was lost (docs/defects/fixed/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md).
    const middle = rule(".status-strip__item[data-middle='1']");
    expect(middle).toContain('flex: 0 1 var(--status-strip-label-basis, auto)');
    expect(middle).toContain('min-width: 0');
    expect(middle).toContain('box-sizing: border-box');
    expect(middle).toContain('text-overflow: clip');
    expect(rule('.status-strip__suffix')).toContain('flex: none');
  });

  it('lets the path link give up its width before a branch name does, and hides a link whose label rule 2 hid (REQ-WORKSPACE-149 rule 2)', () => {
    // With equal shrink factors a long path took the branch name's share in proportion to its basis and squeezed `main` to
    // `m…` or nothing at 1180 px while the row had room for it (the verifier of the 2026-10-03 repair round).
    const link = rule(".status-strip__link[data-middle='1']");
    const factor = Number(/flex-shrink:\s*([0-9.e+]+)/u.exec(link)?.[1]);
    expect(factor).toBeGreaterThanOrEqual(1_000_000);
    // The branch item keeps the ordinary factor, so once the path is at nothing the branch name shrinks rather than overflow.
    expect(rule(".status-strip__item[data-middle='1']")).toMatch(/flex: 0 1 /u);
    expect(rule(".status-strip__link[data-label-hidden='1']")).toContain('visibility: hidden');
  });

  it('colours the strip\'s branch icon with the accent token, so a theme change re-renders it (REQ-SHELL-042)', () => {
    expect(rule('.status-strip__icon')).toContain('color: var(--rt-accent)');
    expect(rule('.status-strip__icon')).toContain('flex: none');
  });

  it('makes status items and checkpoint columns keyboard-reachable through horizontal scrolling', () => {
    expect(rule('.status-strip')).toContain('overflow-x: auto');
    expect(rule('.git__table-scroll')).toContain('overflow-x: auto');
    expect(rule('.git__checkpoint-table')).toContain('min-width: 560px');
  });

  it('gives the worktree columns their content floor and the card the scroll that reaches it', () => {
    // Measured live at 1000x680: the six columns that cannot give way need 56 + 64 + 52 + 52 + 76 + 64 px,
    // and Branch elides (UIR-002) into whatever is left. `width: 100%` alone guaranteed the card never
    // scrolled, so the last column's overflow — 12 px — was simply outside the box. The figures are spelled
    // in `ch` because each floor is a word, and the adopted language takes no literal pixel.
    expect(rule('.git__worktree-table')).toContain('min-width: 63ch');
    expect(rule('.git__col-files')).toContain('width: 12ch');
    expect(rule('.git__col-actions')).toContain('width: 9ch');
    expect(rule('.git-card--table')).toContain('overflow-x: auto');
  });

  it('keeps the start-session dialog inside the 1000x680 minimum with its actions reachable (REQ-SHELL-022/125)', () => {
    // The three sections plus the disclosure and advisory the spec requires stood 904 px tall,
    // so the run-start selector and both actions left the screen. The panel caps itself at the
    // viewport; the CHOICES scroll under a fixed head and foot, so the run-start selector —
    // first section, the choice the acceptance path walks — never sits under a pressed control.
    expect(rule('.start-session')).toContain('max-height: calc(100vh - 2 * var(--rt-space-4))');
    expect(rule('.start-session__scroll')).toContain('overflow-y: auto');
    expect(rule('.start-session .dialog-actions')).toContain('flex: none');
  });

  it('breaks an unbroken token in the sidebar Project section\'s failure hint inside the column (REQ-WORKSPACE-113)', () => {
    // "Last run failed: {message}" carries the failed task's raw output, and one token of it — measured live as
    // `[8996:1001/041354.004464:ERROR:dbus/bus.cc:406]` — has no break opportunity. The hint ran 60 px past the
    // sidebar (scrollWidth 295 in a 235 px box) and gave the column a horizontal scrollbar.
    expect(rule('.agents__project .settings__hint')).toContain('overflow-wrap: anywhere');
  });

  it('breaks an unbroken token in a task\'s text inside the plan column (REQ-SHELL-022)', () => {
    // A task's text is the rename control, and a token in it with no break opportunity — the live run's quoted
    // `printf "LINE-%03d xxxx…"` — ran past the sidebar. Measured in the built app by `layout-proof` section 6: a
    // 200-character token's content 1273 px wide in a 189 px box, the sidebar's scrollWidth 1307 against 259.
    expect(rule('.todo-task__text')).toContain('overflow-wrap: anywhere');
  });

  it('keeps each session row\'s Open inside the Sessions dialog under a long workspace path (REQ-SHELL-022/126, REQ-SESSION-118)', () => {
    // The table is `width: 100%` but sizes itself to its columns' least widths, and the Session cell's workspace path
    // broke only at its hyphens, so its longest unbroken run set the column's floor; the Branch cell did not break at
    // all. Measured in the built app at 1440x900 under a workspace path holding a 111-character run: the table 1123 px
    // wide in an 878 px scroll box, the row's Open at 1279-1328 against the box's right edge at 1160, so the
    // checkpoint proof's click on it (scenario 9, a worktree path and a `rotaris/session/<uuid>` branch) landed on
    // nothing. Every cell that carries a path or a branch now breaks anywhere, so no column's floor is a string's length.
    expect(rule('.session-browser__detail')).toContain('overflow-wrap: anywhere');
    expect(rule('.session-browser__name')).toContain('overflow-wrap: anywhere');
    const branch = rule('.session-browser__table td[data-testid="session-row-branch"]');
    expect(branch).toContain('overflow-wrap: anywhere');
    expect(branch).not.toContain('white-space: nowrap');
  });

  it('fits the status strip to the 1000x680 minimum by REQ-SHELL-047\'s thresholds, not by scrolling (REQ-MONITOR-051)', () => {
    // Measured by fin8 at 1000x680 before the repair: scrollWidth 1026 against clientWidth 1000 with an unconfined session
    // focused, 1167 with a confined one. The strip held four items REQ-SHELL-038 does not list and hid nothing at any
    // width. Now the list is REQ-SHELL-038's, the spacer between the branch and the flags gives its slack back first, and
    // the path goes below 1180 px and the background count below 1080 px; `overflow-x: auto` stays the last resort only.
    const facts: StripFacts = {
      workspace: { label: '~/work/rotaris', path: '/home/u/work/rotaris', open: () => undefined },
      branch: { text: 'main', title: 'Branch this workspace is on: main.' },
      safety: { circuitBreakerArmed: true, unsavedSettings: false, outsideWorkspace: false, mode: 'mode: ask' },
      sandbox: statusStripSandboxItem({ sandboxed: true, sandboxBackend: 'bubblewrap' }),
      model: { name: 'scripted', label: 'model: scripted' },
      tokens: 0, cost: null, backgroundSessions: 0,
    };
    const ids = (w: number) => stripItems(w, facts).flatMap((i) => (i.kind === 'spacer' ? ['spacer'] : [i.testId]));
    expect(ids(1400)).toEqual(['strip-workspace', 'strip-branch', 'spacer', 'strip-circuit-breaker', 'strip-redaction', 'strip-file-access', 'strip-sandbox', 'strip-mode', 'strip-model', 'strip-tokens', 'strip-background']);
    expect(ids(1180)).toContain('strip-workspace');
    expect(ids(1179)).not.toContain('strip-workspace');
    expect(ids(1080)).toContain('strip-background');
    expect(ids(1079)).not.toContain('strip-background');
    expect(ids(1000)).toEqual(['strip-branch', 'spacer', 'strip-circuit-breaker', 'strip-redaction', 'strip-file-access', 'strip-sandbox', 'strip-mode', 'strip-model', 'strip-tokens']);
    expect(rule('.status-strip__spacer')).toContain('flex: 1 1 0');
    expect(rule('.status-strip__spacer')).toContain('min-width: 0');
    expect(rule('.status-strip')).toContain('gap: var(--rt-space-3)');
  });
});
