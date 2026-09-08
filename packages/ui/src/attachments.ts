import type { ImageAttachmentInput } from '@rotaris/contracts';

export const IMAGE_SINGLE_LIMIT = 10 * 1024 * 1024;
export const IMAGE_TOTAL_LIMIT = 25 * 1024 * 1024;
export const IMAGE_COUNT_LIMIT = 10;

export function sniffImageMediaType(bytes: Uint8Array): ImageAttachmentInput['mediaType'] | null {
  const ascii = (from: number, length: number) => String.fromCharCode(...bytes.slice(from, from + length));
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  return null;
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binary);
}

/** REQ-CHAT-170: content decides the type and every ceiling is checked before changing composer state. */
export function addImageBytes(current: readonly ImageAttachmentInput[], name: string, bytes: Uint8Array): { ok: true; value: ImageAttachmentInput } | { ok: false; reason: string } {
  if (current.length >= IMAGE_COUNT_LIMIT) return { ok: false, reason: `Up to ${IMAGE_COUNT_LIMIT} images can be attached.` };
  if (bytes.byteLength > IMAGE_SINGLE_LIMIT) return { ok: false, reason: `${name}: each image must be 10 MiB or smaller.` };
  const total = current.reduce((sum, file) => sum + file.size, 0) + bytes.byteLength;
  if (total > IMAGE_TOTAL_LIMIT) return { ok: false, reason: 'Attached images must total 25 MiB or less.' };
  const mediaType = sniffImageMediaType(bytes);
  if (mediaType === null) return { ok: false, reason: `${name}: supported image content is PNG, JPEG, WebP, or GIF.` };
  return { ok: true, value: { name, mediaType, size: bytes.byteLength, base64: base64Of(bytes) } };
}

/** REQ-CHAT-174: image cost is unknown and non-zero until REQ-PROVIDER-150 supplies a costing rule. */
export function composerTokenEstimate(text: string, attachments: readonly ImageAttachmentInput[]): { tokens: number; lowerBound: boolean; label: string } {
  const tokens = Math.ceil(text.length / 4) + attachments.length;
  const lowerBound = attachments.length > 0;
  return { tokens, lowerBound, label: `~${tokens} tok${lowerBound ? ' lower bound' : ''}` };
}
