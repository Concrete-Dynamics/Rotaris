import { createHash } from 'node:crypto';

/**
 * The three hashes of spec 08 §Hashes, distinguishable by length alone (REQ-TRACE-037): the store content hash is
 * 16 hex over the whole normalised document (036), the canonical hash is 32 hex per declared identifier over a
 * stripped, whitespace-collapsed payload (037), and the global fingerprint is a full 64-hex SHA-256 (058).
 */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** CRLF and lone CR to LF before any parsing or hashing (REQ-TRACE-006). */
export function normaliseLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** UTF-8 with undecodable bytes replaced rather than raising (006, 081): Node's decoder substitutes U+FFFD. */
export function decodeUtf8(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8');
}

export function contentHash(normalisedDocument: string): string {
  return sha256Hex(normalisedDocument).slice(0, 16);
}

/** Each line stripped and its interior whitespace runs collapsed to one space, then LF-joined (037). */
export function canonicalPayload(lines: readonly string[]): string {
  return lines.map((l) => l.trim().replace(/\s+/g, ' ')).join('\n');
}

export function canonicalHash(lines: readonly string[]): string {
  return sha256Hex(canonicalPayload(lines)).slice(0, 32);
}

export interface FingerprintRecord {
  readonly id: string; readonly status: string; readonly traceRequired: boolean; readonly testRequired: boolean;
  readonly title: string; readonly sourcePath: string; readonly contentHash: string; readonly kind: string; readonly derivedFrom: readonly string[];
}

/** `identifier|status|int(trace)|int(test)|title|source_path|content_hash|type|derived`, ascending number order, LF-joined (058). */
export function fingerprintPayload(records: readonly FingerprintRecord[]): string {
  return records.map((r) => [r.id, r.status, r.traceRequired ? 1 : 0, r.testRequired ? 1 : 0, r.title, r.sourcePath, r.contentHash, r.kind, r.derivedFrom.join(',')].join('|')).join('\n');
}

export function fingerprintOf(records: readonly FingerprintRecord[]): string {
  return sha256Hex(fingerprintPayload(records));
}
