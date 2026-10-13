import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutSettings, NETWORK_DISCLOSURE, NO_THIRD_PARTY_BUNDLE } from './About.js';

/**
 * REQ-SHELL-142's caption, inside `pnpm check`: the built-app measurement (settings-proof's computed-size assertion) is the
 * evidence; this pins the two facts it rests on, so the regression that set the caption in the browser's default size —
 * a bare `text-secondary`, which sets a colour and no size — fails a unit test and not only a proof.
 */
const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8');
const fontSizeOf = (selector: string): string | undefined => {
  const rule = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  return rule?.[1] !== undefined ? /font-size:\s*(var\(--[a-z0-9-]+)/.exec(rule[1])?.[1] : undefined;
};
const draw = (thirdPartyLicenses: boolean, info: 'present' | 'absent' = 'present') => renderToStaticMarkup(createElement(AboutSettings, {
  info: info === 'absent' ? null : { version: '0.1.0', build: null, standalone: false, thirdPartyLicenses },
  onOpenExternal: async () => ({ ok: true as const }),
  onOpenThirdPartyLicenses: async () => ({ ok: true as const }),
}));

describe('the About licensing caption (REQ-SHELL-142)', () => {
  it('states that the build carries no third-party bundle, in the caption class and not a bare colour class', () => {
    const html = draw(false);
    const caption = /<p class="([^"]*)" data-testid="licenses-caption">([^<]*)<\/p>/.exec(html);
    expect(caption?.[2]).toBe(NO_THIRD_PARTY_BUNDLE);
    expect(caption?.[1]).toBe('about__caption');
  });

  it('is set at the licence line\'s own type token, `.about__value`\'s, named and never a literal size', () => {
    expect(fontSizeOf('.about__caption')).toBe('var(--rt-text-sm');
    expect(fontSizeOf('.about__caption')).toBe(fontSizeOf('.about__value'));
  });

  it('is absent when the build carries the bundle', () => {
    expect(draw(true)).not.toContain('data-testid="licenses-caption"');
  });
});

/**
 * REQ-STARTUP-160: the application itself discloses its network activity on About & Legal — static text, drawn from the
 * bundle alone, never behind a modal, an interstitial, a checkbox or a hover, and naming no host. The built app's reading at
 * REQ-SHELL-022's minimum window size is `settings-proof`'s (`docs/defects/fixed/the-about-page-carries-no-network-activity-disclosure.md`).
 */
describe('the network-activity disclosure on About & Legal (REQ-STARTUP-160)', () => {
  const section = (html: string): string => /<section[^>]*data-testid="network-disclosure"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[0] ?? '';
  const statements = Object.values(NETWORK_DISCLOSURE);
  // The server renderer escapes an apostrophe; the text the reader sees is the decoded one.
  const decoded = (html: string): string => html.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');

  it('is a labelled section of the surface carrying the three statements as plain paragraphs', () => {
    const html = section(draw(false));
    expect(html).not.toBe('');
    expect(html).toMatch(/aria-labelledby="about-network-heading"/);
    expect(html).toMatch(/<h2 class="settings__heading" id="about-network-heading">Network activity<\/h2>/);
    const paragraphs = [...html.matchAll(/<p class="about__value" data-testid="network-disclosure-statement">([^<]*)<\/p>/g)].map((m) => decoded(m[1] ?? ''));
    expect(paragraphs).toEqual(statements);
  });

  it('reads from the bundle alone: drawn before main has answered with any fact about the build', () => {
    expect(decoded(section(draw(false, 'absent')))).toContain(NETWORK_DISCLOSURE.updates);
  });

  it('needs nothing dismissed, accepted or hovered: no dialog, details, checkbox, button or tooltip inside it', () => {
    const html = section(draw(true));
    expect(html).not.toMatch(/<(dialog|details|summary|input|button)\b|role="dialog"|\btitle="|hidden/);
  });

  it('states the setup clause: what may be contacted, when, and only for work not already done (REQ-STARTUP-058/064/084)', () => {
    const s = NETWORK_DISCLOSURE.setup;
    for (const part of ['first launch', 'warming caches', 'may contact', 'tool archives', 'package registries', 'package runners', 'only for work this machine has not already done']) expect(s).toContain(part);
  });

  it('states the update check: a supported standalone build, each window activation, not able to be turned off (REQ-STARTUP-105/111/114)', () => {
    const s = NETWORK_DISCLOSURE.updates;
    for (const part of ['supported standalone build', 'release endpoint', 'newer release', 'each time one of its windows is activated', 'cannot be turned off']) expect(s).toContain(part);
  });

  it('states what the requests can expose and what they never carry', () => {
    const s = NETWORK_DISCLOSURE.exposure;
    for (const part of ['IP address', 'never carry', 'project files', 'prompt text', 'provider credentials']) expect(s).toContain(part);
  });

  it('names no host, endpoint or address of any kind', () => {
    for (const s of statements) expect(s).not.toMatch(/:\/\/|\bwww\.|\.(com|org|io|net|ai|dev)\b|github|npmjs|pypi|api\./i);
  });
});
