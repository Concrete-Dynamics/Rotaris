import { describe, expect, it } from 'vitest';
import { useShellState } from './shell-state.js';

describe('ui — shell state (REQ-SHELL-025, REQ-SHELL-026)', () => {
  it('starts on Overview, switches to a known view, and treats an unknown identifier as a silent no-op', () => {
    expect(useShellState.getState().activeView).toBe('overview');
    useShellState.getState().switchView('git');
    expect(useShellState.getState().activeView).toBe('git');
    useShellState.getState().switchView('nonsense');
    expect(useShellState.getState().activeView).toBe('git');
  });
});
