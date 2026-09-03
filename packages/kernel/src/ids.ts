/**
 * Branded identifiers. A session id and a workspace identifier are both
 * strings on the wire and must never be confused in a signature.
 *
 * - `SessionId`: REQ-SESSION-001 — one workspace plus one session id resolves one record.
 * - `WorkspaceId`: REQ-SESSION-197 — the identifier minted into `<workspace>/.rotaris/`,
 *   never reused, never the path. Pattern fixed here; ADR-0058.
 * - `StreamId`: REQ-TOOLS-127 / REQ-SHELL-104 — a terminal stream.
 * - `RequestId`: REQ-MONITOR-254 — an approval request an answer is routed by.
 * - `MachineId`: REQ-SESSION-046 — what supplies `host`; minted once per machine,
 *   never the operating-system name. IC-4.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SessionId = Brand<string, 'SessionId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type StreamId = Brand<string, 'StreamId'>;
export type RequestId = Brand<string, 'RequestId'>;
export type MachineId = Brand<string, 'MachineId'>;

export const WORKSPACE_ID_PATTERN = /^v1-[0-9a-f]{32}$/;
export const MACHINE_ID_PATTERN = /^m1-[0-9a-f]{32}$/;

export function asSessionId(s: string): SessionId {
  return s as SessionId;
}
export function asStreamId(s: string): StreamId {
  return s as StreamId;
}
export function asRequestId(s: string): RequestId {
  return s as RequestId;
}

export function parseWorkspaceId(s: string): WorkspaceId | undefined {
  return WORKSPACE_ID_PATTERN.test(s) ? (s as WorkspaceId) : undefined;
}
export function parseMachineId(s: string): MachineId | undefined {
  return MACHINE_ID_PATTERN.test(s) ? (s as MachineId) : undefined;
}

/** 32 lowercase hex characters from 16 random bytes. The source of randomness is injected. */
export function mintWorkspaceId(randomHex32: string): WorkspaceId {
  const id = `v1-${randomHex32}`;
  const parsed = parseWorkspaceId(id);
  if (!parsed) throw new Error('mintWorkspaceId: randomHex32 must be 32 lowercase hex characters');
  return parsed;
}
export function mintMachineId(randomHex32: string): MachineId {
  const id = `m1-${randomHex32}`;
  const parsed = parseMachineId(id);
  if (!parsed) throw new Error('mintMachineId: randomHex32 must be 32 lowercase hex characters');
  return parsed;
}
