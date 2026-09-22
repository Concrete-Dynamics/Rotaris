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
    // Measured live at 1000x680: the five columns that cannot give way need 56 + 64 + 52 + 52 + 76 + 64,
    // and Branch and Session elide (UIR-002) into whatever is left. `width: 100%` alone guaranteed the
    // card never scrolled, so the last column's overflow — 12 px — was simply outside the box.
    expect(rule('.git__worktree-table')).toContain('min-width: 408px');
    expect(rule('.git__col-files')).toContain('width: 76px');
    expect(rule('.git__col-actions')).toContain('width: 64px');
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
});
