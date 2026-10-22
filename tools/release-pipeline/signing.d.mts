// The types for `signing.mjs` (REQ-STARTUP-167, REQ-STARTUP-168), declared for the tests beside it; the module is plain
// JavaScript so the signing job runs it without `pnpm install`.

export interface KeyRecordRow {
  readonly version: string;
  /** `sha256:<hex>` fingerprints of the SubjectPublicKeyInfo DER of each key the release's build carries. */
  readonly keys: readonly string[];
}
export interface KeyRecord {
  readonly schemaVersion: 1;
  readonly releases: readonly KeyRecordRow[];
}

export declare const SIGNING_KEY_VARIABLE: 'ROTARIS_RELEASE_SIGNING_KEY';
export declare const KEY_RECORD_SCHEMA_VERSION: 1;
export declare const RELEASE_SIGNING_KEYS: readonly string[];
export declare function keyFingerprint(pem: string): string;
export declare function carriedKeyFingerprints(keys?: readonly string[]): string[];
export declare function signManifest(manifest: Uint8Array, privatePem: string): Buffer;
export declare function readKeyRecord(path: string): { record: KeyRecord } | { problems: string[] };
export declare function checkKeyRecordShape(parsed: unknown, where?: string): { record: KeyRecord } | { problems: string[] };
export declare function keyRecordRow(version: string, keys?: readonly string[]): KeyRecordRow;
export declare function checkBuildAgainstRecord(record: KeyRecord, version: string, keys?: readonly string[]): string[];
export declare function checkOfferable(record: KeyRecord, version: string, signingFingerprint: string): string[];
export declare function verifyReleaseSignature(input: { manifest: Uint8Array; signature: Uint8Array; version: string; record: KeyRecord; keys?: readonly string[] }): string[];
