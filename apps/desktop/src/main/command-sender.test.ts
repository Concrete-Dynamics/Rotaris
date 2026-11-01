import { describe, expect, it } from 'vitest';
import { commandSenderVerdict, commandWindowFor, refuseCommandSender, UNTRUSTED_SENDER } from './command-sender.js';
import type { ApplicationPages } from './permissions.js';

const OWN: ApplicationPages = { rendererIndex: '/opt/rotaris/out/renderer/index.html', devServerUrl: undefined, platform: 'linux' };
const PAGE = 'file:///opt/rotaris/out/renderer/index.html?role=approval';

describe('which main window a sender speaks for (REQ-SHELL-020, ADR-0048 B)', () => {
  // Window 1 and 2 are main windows; 10 is a persona window of 2; 20 is a dialog over 2; 21 a dialog over the persona window
  // 10; 30 has no parent; 40 and 41 are each other's parent.
  const lookup = (id: number): string | undefined => ({ 1: 'main 1', 2: 'main 2', 10: 'main 2' } as Record<number, string>)[id];
  const parents: Record<number, number> = { 20: 2, 21: 10, 40: 41, 41: 40 };
  const parentOf = (id: number): number | undefined => parents[id];

  it('answers a main window, and a persona or terminal window, as the lookup does', () => {
    expect(commandWindowFor(1, lookup, parentOf)).toBe('main 1');
    expect(commandWindowFor(10, lookup, parentOf)).toBe('main 2');
  });
  it('answers a dialog for the window it was raised over, and not for the active one', () => {
    expect(commandWindowFor(20, lookup, parentOf)).toBe('main 2');
    expect(commandWindowFor(21, lookup, parentOf)).toBe('main 2');
  });
  it('finds none for a sender no window of the application stands behind, and ends a cycle', () => {
    expect(commandWindowFor(30, lookup, parentOf)).toBeUndefined();
    expect(commandWindowFor(40, lookup, parentOf)).toBeUndefined();
  });
});

describe('who may send a command (Electron security checklist 17; OQ-466)', () => {
  it('admits the application\'s own page in a window the application opened', () => {
    expect(commandSenderVerdict({ senderId: 1, frameUrl: PAGE, known: true }, OWN, false)).toEqual({ admitted: true });
  });
  it('refuses a frame that is not the application\'s own page, with one warning naming its origin alone', () => {
    for (const frameUrl of ['https://example.invalid/page?token=secret', 'file:///opt/rotaris/out/renderer/other.html', 'about:blank', undefined]) {
      const verdict = commandSenderVerdict({ senderId: 1, frameUrl, known: true }, OWN, true);
      expect(verdict.admitted).toBe(false);
      if (verdict.admitted) continue;
      expect(verdict.outcome).toMatchObject({ ok: false, code: UNTRUSTED_SENDER });
      expect(verdict.warning).toMatch(/^command refused: sent from /);
      expect(verdict.warning).not.toContain('secret');
      expect(verdict.warning).not.toContain('other.html');
    }
  });
  it('refuses an unregistered sender in a packaged build, and admits it where the verification seams are built in', () => {
    const packaged = commandSenderVerdict({ senderId: 99, frameUrl: PAGE, known: false }, OWN, false);
    expect(packaged.admitted).toBe(false);
    if (!packaged.admitted) {
      expect(packaged.outcome).toEqual({ ok: false, code: UNTRUSTED_SENDER, headline: 'The command came from a window the application did not open' });
      expect(packaged.warning).toContain('sender 99 is no window the application opened');
    }
    expect(commandSenderVerdict({ senderId: 99, frameUrl: PAGE, known: false }, OWN, true)).toEqual({ admitted: true });
  });
});

describe('the IPC handler\'s check, as the channel calls it', () => {
  const admission = (known: boolean, admitUnknown: boolean, warnings: string[]) => ({
    standingBehind: (id: number) => (known ? { wcId: id } : undefined), own: OWN, admitUnknown, warn: (m: string) => { warnings.push(m); },
  });
  it('lets the application\'s own page in its own window through, and writes nothing', () => {
    const warnings: string[] = [];
    expect(refuseCommandSender({ sender: { id: 1 }, senderFrame: { url: PAGE } }, admission(true, false, warnings))).toBeUndefined();
    expect(warnings).toEqual([]);
  });
  it('refuses another page, and a frame already disposed, with one warning each', () => {
    const warnings: string[] = [];
    expect(refuseCommandSender({ sender: { id: 1 }, senderFrame: { url: 'https://example.invalid/' } }, admission(true, true, warnings))).toMatchObject({ code: UNTRUSTED_SENDER });
    const disposed = { sender: { id: 1 }, get senderFrame(): { url: string } { throw new Error('Render frame was disposed before WebFrameMain could be accessed'); } };
    expect(refuseCommandSender(disposed, admission(true, true, warnings))).toMatchObject({ code: UNTRUSTED_SENDER });
    expect(refuseCommandSender({ sender: { id: 1 }, senderFrame: null }, admission(true, true, warnings))).toMatchObject({ code: UNTRUSTED_SENDER });
    expect(warnings).toHaveLength(3);
  });
  it('refuses a sender no window stands behind unless the seams are built in', () => {
    const warnings: string[] = [];
    expect(refuseCommandSender({ sender: { id: 99 }, senderFrame: { url: PAGE } }, admission(false, false, warnings))).toMatchObject({ code: UNTRUSTED_SENDER });
    expect(refuseCommandSender({ sender: { id: 99 }, senderFrame: { url: PAGE } }, admission(false, true, warnings))).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });
});
