import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutSettings, NO_THIRD_PARTY_BUNDLE } from './About.js';

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
const draw = (thirdPartyLicenses: boolean) => renderToStaticMarkup(createElement(AboutSettings, {
  info: { version: '0.1.0', build: null, standalone: false, thirdPartyLicenses },
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
