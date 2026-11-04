import type { z } from 'zod';

/**
 * The size bounds on what a renderer command carries — OQ-467, ruled 2026-11-01 under the owner's delegation (R-072;
 * `docs/archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467`), PD-CHAT-011 for the composer's draft
 * and images. The renderer is the one process that shows web content (ADR-0044), and REQ-SHELL-020 has main filter
 * what a renderer asks: without a bound a renderer could hand main a payload of any size on the one channel every kind
 * shares. No requirement states a figure, so the ruling's figures fill the gap. Every length is counted as JavaScript
 * string length (UTF-16 code units), which is what zod's `.max()` counts.
 *
 * The ruling names the constants "in `commands.ts`"; they live here so that `channels.ts`, `control.ts`, `config.ts`
 * and the other modules whose schemas `CommandRequestSchema` spreads can bound their fields without importing
 * `commands.ts`, which imports them. `commands.ts` and `process-protocol.ts` read the same constants (ADR-0044's
 * second boundary, held equal by `limits.test.ts`).
 */

/**
 * Free text: every human-authored or content-bearing string — a prompt, a composer draft, a plan edit and the changes
 * a revise states, an artifact's body, a saved prompt, a notice's message, a requirement document. One mebibyte of
 * characters: far past anything typed, and it refuses pastes a very-large-context model could accept, which the
 * ruling records as a later question's to raise.
 */
export const FREE_TEXT_MAX = 1_048_576;

/**
 * A path, and everything that may be as long as one: every `path`, a workspace, a URL, a base URL and an API key (a
 * signed URL or a token can exceed a name's bound). 32,767 characters is the longest path Windows addresses.
 */
export const PATH_MAX = 32_767;

/** A name or an identifier: every id, name, ref, branch, key, label, model key and media type. */
export const NAME_MAX = 1_024;

/** OQ-467: an array of ids, or of any other item a command lists, takes a count bound of 1,024. */
export const LIST_MAX = 1_024;

/**
 * OQ-455: 24 MiB of audio as base64, the size a hosted transcription endpoint itself refuses past. OQ-467 bounds each
 * image attachment's base64 at the same figure, provisionally (PD-CHAT-011).
 */
export const DICTATION_AUDIO_MAX_BASE64 = 32 * 1024 * 1024;

/** The length of a value as JSON — how an open-shaped payload (`config.setField.patch`) is held to `FREE_TEXT_MAX`. */
export function jsonLength(value: unknown): number {
  try { return JSON.stringify(value)?.length ?? 0; } catch { return Number.POSITIVE_INFINITY; }
}

const jsonBoundedSchemas = new WeakSet<object>();

/**
 * A payload whose shape is open (`z.unknown()` values, `config.setField.patch` among them), refused as `too_big` when its
 * JSON is longer than `max`, so the malformed headline below names it on the same terms as a string past its bound.
 * The schema it returns is remembered, so `limits.test.ts`'s walk admits an `unknown` under it and under nothing else.
 */
export function jsonBounded<T extends z.ZodType>(schema: T, max: number = FREE_TEXT_MAX): T {
  const bounded = schema.superRefine((value, ctx) => {
    if (jsonLength(value) > max) ctx.addIssue({ code: 'too_big', origin: 'string', maximum: max, inclusive: true, message: `longer than ${max} characters as JSON` });
  });
  jsonBoundedSchemas.add(bounded);
  return bounded;
}

/** Whether a schema was made by `jsonBounded`. */
export function isJsonBounded(schema: unknown): boolean {
  return typeof schema === 'object' && schema !== null && jsonBoundedSchemas.has(schema);
}

type Issue = z.core.$ZodIssue;
type PathKey = PropertyKey;

/**
 * A path as a field name. A segment that is not a short identifier is a record key the renderer chose — data, not a
 * field of the contract — and is written `[key]`, so a key past its bound is never echoed back in the headline.
 */
function fieldName(path: readonly PathKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else if (typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) out += out === '' ? key : `.${key}`;
    else out += '[key]';
  }
  return out;
}

/** The first issue that is a bound, looked for through unions and record keys, with the path it sits at. */
function firstBound(issues: readonly Issue[], prefix: readonly PathKey[]): { issue: Extract<Issue, { code: 'too_big' }>; path: readonly PathKey[] } | null {
  for (const issue of issues) {
    const path = [...prefix, ...issue.path];
    if (issue.code === 'too_big') return { issue, path };
    if (issue.code === 'invalid_union') for (const branch of issue.errors) { const found = firstBound(branch, path); if (found) return found; }
    if (issue.code === 'invalid_key' || issue.code === 'invalid_element') { const found = firstBound(issue.issues, path); if (found) return found; }
  }
  return null;
}

/**
 * OQ-467: the headline of a `command.malformed` answer, built from zod's issues and never from the value (REQ-NOTIFY-005;
 * a prompt or a key past its bound must not come back in the refusal). A bound names the field and the bound — "The
 * prompt is longer than 1,048,576 characters" — and any other refusal names the field it met.
 */
export function malformedHeadline(issues: readonly Issue[]): string {
  const bound = firstBound(issues, []);
  if (bound) {
    const field = fieldName(bound.path) || 'request';
    const max = Number(bound.issue.maximum).toLocaleString('en-US');
    return bound.issue.origin === 'array' || bound.issue.origin === 'set'
      ? `The ${field} has more than ${max} items`
      : `The ${field} is longer than ${max} characters`;
  }
  const first = issues[0];
  const field = first ? fieldName(first.path) : '';
  return field === '' ? 'The request could not be read' : `The request could not be read: the ${field} is not valid`;
}

/** OQ-485: the three classes a `command.malformed` refusal falls in, each folded on its own in main's warning line. */
export type MalformedClass = 'unknown kind' | 'past a bound' | 'unreadable';

/**
 * OQ-485 (ruled 2026-11-04): the class of a `command.malformed` refusal, read from zod's issues by the same walk as the
 * headline: a bound anywhere (`past a bound`), the request's own `kind` matching no member of the union (`unknown kind`),
 * or any other shape (`unreadable`). Like the headline, it reads no value.
 */
export function malformedClass(issues: readonly Issue[]): MalformedClass {
  if (firstBound(issues, [])) return 'past a bound';
  const ownKind = (issue: Issue): boolean => issue.code === 'invalid_union' && 'note' in issue && issue.note === 'No matching discriminator' && (issue.path.length === 0 || (issue.path.length === 1 && issue.path[0] === 'kind'));
  return issues.some(ownKind) ? 'unknown kind' : 'unreadable';
}
