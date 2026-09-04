import { describe, expect, it } from 'vitest';
import { useShellState } from './shell-state.js';
import { applyTheme, assertDistinctRoleColours, deriveShade, motionReduced, setStoredMotionPreference } from './index.js';
import { resolveTheme } from '@rotaris/contracts';

describe('ui — shell state (REQ-SHELL-025, REQ-SHELL-026)', () => {
  it('starts on Overview, switches to a known view, and treats an unknown identifier as a silent no-op', () => {
    expect(useShellState.getState().activeView).toBe('overview');
    useShellState.getState().switchView('git');
    expect(useShellState.getState().activeView).toBe('git');
    useShellState.getState().switchView('nonsense');
    expect(useShellState.getState().activeView).toBe('git');
  });
});

describe('ui — theme projection and motion', () => {
  it('projects every token and declares the theme metadata on the root', () => {
    const values = new Map<string, string>();
    const root = { style: { setProperty: (name: string, value: string) => values.set(name, value), colorScheme: '' }, dataset: {} } as unknown as HTMLElement;
    applyTheme(resolveTheme('nocturne'), root);
    expect(values.get('--rt-bg')).toBe('oklch(14% 0 0)');
    expect(root.dataset['theme']).toBe('nocturne');
    expect(root.dataset['dark']).toBe('true');
  });

  it('corrects shades through the shared lightness function and refuses duplicate slash roles', () => {
    expect(deriveShade('oklch(30% 0.1 165)', 'oklch(10% 0 0)')).toMatch(/^oklch\(/);
    expect(() => assertDistinctRoleColours(['a', 'b', 'c', 'd'])).not.toThrow();
    expect(() => assertDistinctRoleColours(['a', 'b', 'c', 'a'])).toThrow(/pairwise/);
  });

  it('gives the stored reduced-motion setting precedence', () => {
    setStoredMotionPreference(true);
    expect(motionReduced()).toBe(true);
    setStoredMotionPreference(false);
    expect(motionReduced()).toBe(false);
    setStoredMotionPreference(undefined);
  });
});
