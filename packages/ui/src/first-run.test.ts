import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OnboardingView } from '@rotaris/contracts';
import { FIRST_RUN_MODE, FirstRunSetup, homeRelative, modelName, projectName, stepFor, stepState, type FirstRunSetupProps } from './FirstRunSetup.js';

const CHOICES: OnboardingView['providers']['choices'] = [
  { id: 'openai-compatible', displayName: 'OpenAI-compatible endpoint (custom URL)', method: 'api-key', methodLabel: 'Paste an API key', hint: 'Custom endpoint.', defaultBaseUrl: 'https://api.openai.com/v1', custom: true, available: true, unavailabilityReason: null },
  { id: 'copilot', displayName: 'GitHub Copilot', method: 'device-code', methodLabel: 'Device code', hint: '', defaultBaseUrl: null, custom: false, available: true, unavailabilityReason: null },
  { id: 'deepseek', displayName: 'DeepSeek', method: 'api-key', methodLabel: 'Paste an API key', hint: 'DeepSeek.', defaultBaseUrl: null, custom: false, available: true, unavailabilityReason: null },
];
const view = (over: { chosen?: boolean; path?: string | null; repository?: boolean; authenticated?: OnboardingView['providers']['authenticated'] } = {}): OnboardingView => ({
  owed: true,
  project: { chosen: over.chosen ?? false, path: over.path === undefined ? '/home/ada/code/atlas-billing' : over.path, currentIsRepository: over.repository ?? false },
  providers: { authenticated: over.authenticated ?? [], choices: CHOICES },
});
const ok = async () => ({ ok: true as const });
const render = (v: OnboardingView, config: FirstRunSetupProps['config'] = null) => renderToStaticMarkup(createElement(FirstRunSetup, {
  version: '0.1.0', home: '/home/ada', view: v, config,
  onChooseProject: ok, onSignIn: async () => ({ outcome: 'cancelled' as const }), onAssignSlot: ok, onSetMode: ok, onSubmit: ok, onFinish: () => undefined,
}));
const LOCAL = [{ id: 'openai-compatible--local', displayName: 'Local', modelCount: 1 }];

describe('the first-launch setup (PD-WORKSPACE-010)', () => {
  it('derives its step from the facts: the first thing still owed', () => {
    expect(stepFor(view())).toBe('project');
    expect(stepFor(view({ chosen: true }))).toBe('model');
    expect(stepFor(view({ chosen: true, authenticated: LOCAL }))).toBe('prompt');
    // A provider signed in before any project was chosen does not skip the project.
    expect(stepFor(view({ authenticated: LOCAL }))).toBe('project');
  });

  it('words each step against the current one', () => {
    expect((['project', 'model', 'prompt'] as const).map((s) => stepState(s, 'model'))).toEqual(['done', 'now', 'waiting']);
  });

  it('names a project by its folder, a model without its provider, and a path from the home directory', () => {
    expect(projectName('/home/ada/code/atlas-billing/')).toBe('atlas-billing');
    expect(projectName('C:\\\\code\\\\atlas')).toBe('atlas');
    expect(projectName('/')).toBe('/');
    expect(modelName('openai-compatible--local/ds41')).toBe('ds41');
    expect(modelName('ds41')).toBe('ds41');
    expect(homeRelative('/home/ada/code/atlas', '/home/ada')).toBe('~/code/atlas');
    expect(homeRelative('/home/adam/code', '/home/ada')).toBe('/home/adam/code');
    expect(homeRelative('/srv/x', undefined)).toBe('/srv/x');
  });

  it('proposes the autonomous mode to everyone (clause 5)', () => {
    expect(FIRST_RUN_MODE).toBe('autonomous');
  });

  it('is a modal surface that can be skipped from every step, with one filled control', () => {
    for (const v of [view(), view({ chosen: true }), view({ chosen: true, authenticated: LOCAL })]) {
      const html = render(v);
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('data-action="skip-setup"');
      expect((html.match(/btn-primary/g) ?? []).length + (html.match(/strip-send/g) ?? []).length).toBe(1);
    }
  });

  it('asks for a folder, and offers the folder it was started in only when that is a repository', () => {
    const plain = render(view());
    expect(plain).toContain('Choose a folder…');
    expect(plain).not.toContain('Use this folder');
    const repository = render(view({ repository: true }));
    expect(repository).toContain('Use this folder');
    expect(repository).toContain('~/code/atlas-billing');
    expect(repository).toContain('Choose another folder…');
  });

  it('lists the catalogue as one radio group and disables a provider whose sign-in this build lacks, saying so', () => {
    const html = render(view({ chosen: true }));
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(CHOICES.length);
    expect(html).toMatch(/data-choice="copilot"[^>]*disabled/);
    expect(html).toContain('Sign-in is not in this build yet');
    expect(html).toContain('type="password"');
  });

  it('states the connected provider and the three assigned models, the picker closed until asked for', () => {
    const html = render(view({ chosen: true, authenticated: LOCAL }), { slots: { large_model: 'openai-compatible--local/ds41', medium_model: 'openai-compatible--local/ds41', small_model: null }, models: ['openai-compatible--local/ds41'] });
    // The facts stand at the prompt, so the surface opens there; the miniature names the model without its provider.
    expect(html).toContain('data-pane="prompt"');
    expect(html).toContain('>ds41<');
    expect(html).toContain('Runs are autonomous.');
    expect(html).toContain('Open Rotaris without a prompt');
  });

  it('draws every length from a token or a relative unit, and every duration from a motion token', () => {
    const css = readFileSync(new URL('./first-run.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/\b\d+(?:\.\d+)?(?:px|pt|ms)\b/g)).toBeNull();
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgb\(/i);
    // REQ-SHELL-135: the resolved setting stops every animation of the surface, the stored choice read before the OS signal.
    expect(css).toContain(".first-run[data-motion='reduced']");
    expect(css).toContain(".first-run:not([data-motion='full'])");
  });
});
