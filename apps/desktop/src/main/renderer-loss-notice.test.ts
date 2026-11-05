import { describe, expect, it } from 'vitest';
import { rendererLossNotice } from './renderer-loss-notice.js';

/** R-091 (hardening §3.2 row 5; REQ-NOTIFY-005, REQ-NOTIFY-023): what the person reads about a main window's lost renderer. */
describe('rendererLossNotice', () => {
  const window = { wcId: 1, workspace: 'C:/work/p' };
  const loss = { reason: 'crashed', exitCode: -1073741819 };

  it('a reload is a persistent error notice, plain headline, no action, the reason and exit code in the detail', () => {
    const notice = rendererLossNotice(loss, 'reloaded', window);
    expect(notice).toMatchObject({ severity: 'error', title: 'This window stopped and was reloaded', persistent: true });
    expect(notice).not.toHaveProperty('action');
    expect(notice.message).toContain('Runs were not affected.');
    expect(notice.detail).toBe('The renderer process was gone: crashed, exit code -1073741819.\nWindow: main window 1, C:/work/p.\nThe window was reloaded once; a second loss within 60 s leaves it as it is.');
  });

  it('a second loss within the bound says the window was left as it is; a failed reload says so and why', () => {
    expect(rendererLossNotice(loss, 'left', window)).toMatchObject({ severity: 'error', title: 'This window stopped again and was not reloaded' });
    expect(rendererLossNotice(loss, 'left', window).detail).toContain('is not reloaded again');
    const failed = rendererLossNotice(loss, 'reload-failed', window, 'ERR_FAILED (-2) loading index.html');
    expect(failed).toMatchObject({ severity: 'error', title: 'This window stopped and could not be reloaded' });
    expect(failed.detail).toContain('The reload failed: ERR_FAILED (-2) loading index.html.');
  });

  it('OQ-476: a renderer `killed` (TerminateProcess, exit 1) is told as a crash is, the reason and the exit code in the detail', () => {
    const killed = { reason: 'killed', exitCode: 1 };
    const notice = rendererLossNotice(killed, 'reloaded', window);
    expect(notice).toMatchObject({ severity: 'error', title: 'This window stopped and was reloaded', persistent: true });
    expect(notice).not.toHaveProperty('action');
    expect(notice.detail).toBe('The renderer process was gone: killed, exit code 1.\nWindow: main window 1, C:/work/p.\nThe window was reloaded once; a second loss within 60 s leaves it as it is.');
    expect(rendererLossNotice(killed, 'left', window)).toMatchObject({ severity: 'error', title: 'This window stopped again and was not reloaded', persistent: true });
  });
});
