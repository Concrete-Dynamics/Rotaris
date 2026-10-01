import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
});
