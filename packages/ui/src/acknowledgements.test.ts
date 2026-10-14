import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * docs/defects/fixed/an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md: the acknowledgement stack
 * (REQ-NOTIFY-012, the window's bottom-right corner, drawn over everything) stands where the artifact inspector's footer
 * stands, and each acknowledgement took the pointer over its whole box, so a press meant for Save landed on its text.
 * REQ-NOTIFY-020: only the close control accepts interaction (and PD-WORKSPACE-001's one action, which extends
 * REQ-NOTIFY-013). The rest of an acknowledgement takes no pointer, so a press on its text reaches what it is drawn over;
 * it is still drawn over it, as REQ-NOTIFY-012 says.
 */
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
const rulesOf = (selector: string): string => [...css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'g'))].map((m) => m[1] ?? '').join(' ');
const pointer = (selector: string): string | null => /pointer-events\s*:\s*([a-z-]+)/.exec(rulesOf(selector))?.[1] ?? null;

describe('REQ-NOTIFY-020: an acknowledgement takes the pointer only at its close control and its action', () => {
  it('the stack and each acknowledgement\'s box let a press through to what they are drawn over', () => {
    expect(pointer('.ack-stack')).toBe('none');
    expect(pointer('.ack')).toBe('none');
  });

  it('the close control and the one action take the pointer', () => {
    expect(pointer('.ack__close')).toBe('auto');
    expect(pointer('.ack__action')).toBe('auto');
  });

  it('the stack is still drawn over the artifact inspector (REQ-NOTIFY-012)', () => {
    const z = (selector: string) => Number(/z-index\s*:\s*(\d+)/.exec(rulesOf(selector))?.[1] ?? NaN);
    expect(z('.ack-stack')).toBeGreaterThan(z('.artifact-inspector'));
  });
});
