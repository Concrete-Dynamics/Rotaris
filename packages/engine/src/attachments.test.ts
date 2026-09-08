import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { persistAttachments, projectAttachments, readAttachmentBody } from './attachments.js';

const dirs: string[] = [];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('stored image attachments', () => {
  it('REQ-CHAT-171/173: stores bytes below session files and projects path plus digest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-attachments-')); dirs.push(dir);
    const saved = persistAttachments(dir, [{ name: 'renamed.txt', mediaType: 'image/png', size: png.length, base64: png.toString('base64') }]);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const attachment = saved.attachments[0]!;
    expect(attachment.path).toMatch(/^attachments\//);
    expect(attachment.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(dir, attachment.path))).toEqual(png);
    expect(JSON.stringify(attachment)).not.toContain(png.toString('base64'));
    expect(projectAttachments(dir, JSON.stringify(saved.attachments))[0]).toMatchObject({ available: true });
    expect(readAttachmentBody(dir, attachment.path, attachment.digest)).toEqual({ ok: true, base64: png.toString('base64') });
    unlinkSync(join(dir, attachment.path));
    expect(projectAttachments(dir, JSON.stringify(saved.attachments))[0]).toMatchObject({ available: false, unavailableReason: 'Image is no longer available.' });
  });
});
