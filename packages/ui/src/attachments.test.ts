import { describe, expect, it } from 'vitest';
import { IMAGE_SINGLE_LIMIT, addImageBytes, composerTokenEstimate, sniffImageMediaType } from './attachments.js';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);

describe('image attachments', () => {
  it('REQ-CHAT-170: reads type from content across a renamed file', () => {
    expect(sniffImageMediaType(png)).toBe('image/png');
    expect(addImageBytes([], 'renamed.txt', png)).toMatchObject({ ok: true, value: { name: 'renamed.txt', mediaType: 'image/png' } });
    expect(addImageBytes([], 'renamed.png', new TextEncoder().encode('plain text'))).toEqual({ ok: false, reason: 'renamed.png: supported image content is PNG, JPEG, WebP, or GIF.' });
  });

  it('REQ-CHAT-170: rejects a ceiling without changing the accepted input array', () => {
    const first = addImageBytes([], 'one.png', png);
    expect(first.ok).toBe(true);
    const accepted = first.ok ? [first.value] : [];
    expect(addImageBytes(accepted, 'huge.png', new Uint8Array(IMAGE_SINGLE_LIMIT + 1))).toMatchObject({ ok: false });
    expect(accepted).toHaveLength(1);
  });

  it('REQ-CHAT-174: image changes mark the estimate as a changing lower bound', () => {
    const empty = composerTokenEstimate('abcd', []);
    const image = addImageBytes([], 'one.png', png);
    expect(image.ok).toBe(true);
    const attached = composerTokenEstimate('abcd', image.ok ? [image.value] : []);
    expect(empty).toEqual({ tokens: 1, lowerBound: false, label: '~1 tok' });
    expect(attached).toEqual({ tokens: 2, lowerBound: true, label: '~2 tok lower bound' });
  });
});
