import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import type { ImageAttachment, ImageAttachmentInput } from '@rotaris/contracts';
import type { ContentPart } from '@rotaris/model';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

type MediaType = ImageAttachmentInput['mediaType'];
/** REQ-CHAT-046/173: what a user row and the snapshot keep of an image — its reference and digest, never its bytes. */
export type StoredAttachment = Omit<ImageAttachment, 'available' | 'unavailableReason'>;

export function imageMediaType(bytes: Uint8Array): MediaType | null {
  const ascii = (from: number, length: number) => String.fromCharCode(...bytes.slice(from, from + length));
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  return null;
}

function cleanName(name: string): string {
  const safe = basename(name).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '');
  return safe === '' ? 'image' : safe.slice(0, 120);
}

export function validateAttachmentInputs(inputs: readonly ImageAttachmentInput[]): { ok: true; files: { input: ImageAttachmentInput; bytes: Buffer; mediaType: MediaType }[] } | { ok: false; reason: string } {
  if (inputs.length > MAX_ATTACHMENT_COUNT) return { ok: false, reason: `Up to ${MAX_ATTACHMENT_COUNT} images can be attached.` };
  const files: { input: ImageAttachmentInput; bytes: Buffer; mediaType: MediaType }[] = [];
  let total = 0;
  for (const input of inputs) {
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.length !== input.size || bytes.length === 0) return { ok: false, reason: `${input.name}: the supplied image size is invalid.` };
    if (bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, reason: `${input.name}: each image must be 10 MiB or smaller.` };
    const mediaType = imageMediaType(bytes);
    if (mediaType === null) return { ok: false, reason: `${input.name}: supported image content is PNG, JPEG, WebP, or GIF.` };
    total += bytes.length;
    if (total > MAX_ATTACHMENTS_BYTES) return { ok: false, reason: 'Attached images must total 25 MiB or less.' };
    files.push({ input, bytes, mediaType });
  }
  return { ok: true, files };
}

/** REQ-CHAT-173 / REQ-SESSION-002: persist bytes below the session directory and return record-safe metadata. */
export function persistAttachments(sessionDir: string, inputs: readonly ImageAttachmentInput[]): { ok: true; attachments: StoredAttachment[]; content: ContentPart[] } | { ok: false; reason: string } {
  const checked = validateAttachmentInputs(inputs);
  if (!checked.ok) return checked;
  const directory = join(sessionDir, 'attachments');
  mkdirSync(directory, { recursive: true });
  const attachments: StoredAttachment[] = [];
  const content: ContentPart[] = [];
  try {
    for (const file of checked.files) {
      const digest = createHash('sha256').update(file.bytes).digest('hex');
      const path = join(directory, `${digest.slice(0, 16)}-${cleanName(file.input.name)}`);
      if (!existsSync(path)) writeFileSync(path, file.bytes, { flag: 'wx' });
      attachments.push({ name: file.input.name, mediaType: file.mediaType, size: file.bytes.length, path: relative(sessionDir, path).replaceAll('\\', '/'), digest });
      content.push({ kind: 'image', mediaType: file.mediaType, base64: file.bytes.toString('base64') });
    }
  } catch (cause) {
    return { ok: false, reason: `The image attachment could not be stored: ${String(cause instanceof Error ? cause.message : cause)}` };
  }
  return { ok: true, attachments, content };
}

export function decodeStoredAttachments(text: string): StoredAttachment[] {
  try {
    const value = JSON.parse(text) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is StoredAttachment => typeof v === 'object' && v !== null && typeof (v as StoredAttachment).name === 'string' && typeof (v as StoredAttachment).path === 'string' && typeof (v as StoredAttachment).digest === 'string');
  } catch { return []; }
}

/** Reopening verifies both location and digest; one unavailable image leaves the surrounding row intact. */
export function projectAttachments(sessionDir: string, text: string): ImageAttachment[] {
  const root = resolve(sessionDir);
  return decodeStoredAttachments(text).map((attachment) => {
    const file = resolve(root, attachment.path);
    if (!(file === root || file.startsWith(`${root}${sep}`)) || !existsSync(file)) return { ...attachment, available: false, unavailableReason: 'Image is no longer available.' };
    try {
      const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
      return digest === attachment.digest ? { ...attachment, available: true } : { ...attachment, available: false, unavailableReason: 'Image content does not match its recorded digest.' };
    } catch { return { ...attachment, available: false, unavailableReason: 'Image is no longer available.' }; }
  });
}

export function readAttachmentBody(sessionDir: string, path: string, expectedDigest: string): { ok: true; base64: string } | { ok: false; reason: string } {
  const root = resolve(sessionDir);
  const file = resolve(root, path);
  if (!(file === root || file.startsWith(`${root}${sep}`)) || !existsSync(file)) return { ok: false, reason: 'Image is no longer available.' };
  try {
    const bytes = readFileSync(file);
    const digest = createHash('sha256').update(bytes).digest('hex');
    return digest === expectedDigest ? { ok: true, base64: bytes.toString('base64') } : { ok: false, reason: 'Image content does not match its recorded digest.' };
  } catch { return { ok: false, reason: 'Image is no longer available.' }; }
}

