import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ApplicationPages } from './permissions.js';
import { guardWebContents, installWebContentsGuard, type GuardedContents } from './web-contents-guard.js';

const OWN: ApplicationPages = { rendererIndex: '/opt/rotaris/out/renderer/index.html', devServerUrl: undefined, platform: 'linux' };
const PAGE = 'file:///opt/rotaris/out/renderer/index.html';

/** A web contents as the guard sees it: an emitter, and the window-open handler it was given. */
class FakeContents extends EventEmitter implements GuardedContents {
  openHandler: ((details: { readonly url: string }) => { action: 'deny' }) | undefined;
  setWindowOpenHandler(handler: (details: { readonly url: string }) => { action: 'deny' }): void { this.openHandler = handler; }
  /** Emits `event` the way Electron does, and says whether the listener prevented it. */
  fire(event: 'will-navigate' | 'will-redirect' | 'will-attach-webview', url: string): boolean {
    let prevented = false;
    const e = { url, preventDefault: () => { prevented = true; } };
    if (event === 'will-attach-webview') this.emit(event, e, {}, { src: url });
    else this.emit(event, e, url);
    return prevented;
  }
}

function guarded(): { contents: FakeContents; warnings: string[] } {
  const contents = new FakeContents();
  const warnings: string[] = [];
  guardWebContents(contents, OWN, (m) => warnings.push(m));
  return { contents, warnings };
}

describe('the web-contents guard (Electron security checklist 12, 13, 14; OQ-466)', () => {
  it('lets a navigation to the application\'s own page through, and writes nothing', () => {
    const { contents, warnings } = guarded();
    expect(contents.fire('will-navigate', `${PAGE}?role=main`)).toBe(false);
    expect(contents.fire('will-redirect', PAGE)).toBe(false);
    expect(warnings).toEqual([]);
  });
  it('refuses a navigation anywhere else with one warning naming the origin alone', () => {
    const { contents, warnings } = guarded();
    expect(contents.fire('will-navigate', 'https://example.invalid/path?token=secret')).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('navigation refused: will-navigate to https://example.invalid');
    expect(warnings[0]).not.toContain('secret');
    expect(warnings[0]).not.toContain('/path');
  });
  it('refuses a redirect, a sibling file and a scheme with an opaque origin', () => {
    const { contents, warnings } = guarded();
    expect(contents.fire('will-redirect', 'https://example.invalid/')).toBe(true);
    expect(contents.fire('will-navigate', 'file:///opt/rotaris/out/renderer/other.html')).toBe(true);
    expect(contents.fire('will-navigate', 'data:text/html,<p>x</p>')).toBe(true);
    expect(warnings).toEqual([
      expect.stringContaining('will-redirect to https://example.invalid,'),
      expect.stringContaining('will-navigate to file:,'),
      expect.stringContaining('will-navigate to data:,'),
    ]);
  });
  it('reads the URL from the deprecated argument where the event carries none', () => {
    const contents = new FakeContents();
    const warnings: string[] = [];
    guardWebContents(contents, OWN, (m) => warnings.push(m));
    let prevented = false;
    contents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://example.invalid/');
    expect(prevented).toBe(true);
    expect(warnings).toHaveLength(1);
  });
  it('denies every window a page asks to open, its own page among them', () => {
    const { contents, warnings } = guarded();
    expect(contents.openHandler?.({ url: 'https://example.invalid/?q=secret' })).toEqual({ action: 'deny' });
    expect(contents.openHandler?.({ url: PAGE })).toEqual({ action: 'deny' });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('window refused: a page asked to open https://example.invalid;');
    expect(warnings[0]).not.toContain('secret');
  });
  it('refuses a webview', () => {
    const { contents, warnings } = guarded();
    expect(contents.fire('will-attach-webview', 'https://example.invalid/')).toBe(true);
    expect(warnings).toEqual([expect.stringContaining('webview refused: a page asked to attach https://example.invalid')]);
  });
  it('guards every web contents the application builds, from the one registration', () => {
    const app = new EventEmitter();
    const warnings: string[] = [];
    installWebContentsGuard(app, OWN, (m) => warnings.push(m));
    const first = new FakeContents();
    const second = new FakeContents();
    app.emit('web-contents-created', {}, first);
    app.emit('web-contents-created', {}, second);
    expect(first.fire('will-navigate', 'https://example.invalid/')).toBe(true);
    expect(second.fire('will-navigate', 'https://example.invalid/')).toBe(true);
    expect(second.openHandler).toBeDefined();
    expect(warnings).toHaveLength(2);
  });
});

describe('main installs the guard and the sandbox switch before the app is ready (Electron security checklist 4)', () => {
  // `app.enableSandbox()` throws once the app is ready, and a guard registered after a window exists misses that window's
  // first navigation: both must stand in main's module body ahead of the one `await app.whenReady()`.
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const ready = source.indexOf('await app.whenReady()');
  it.each([['the guard', 'installWebContentsGuard(app'], ['the sandbox switch', 'app.enableSandbox();']])('%s', (_name, call) => {
    const at = source.indexOf(call);
    expect(at).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(at);
    expect(source.lastIndexOf('\nasync function main()', at)).toBe(-1);
  });
});
