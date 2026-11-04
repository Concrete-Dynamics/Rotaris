import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { CommandRequestSchema } from './commands.js';
import { DICTATION_AUDIO_MAX_BASE64, FREE_TEXT_MAX, isJsonBounded, jsonBounded, jsonLength, LIST_MAX, malformedClass, malformedHeadline, NAME_MAX, PATH_MAX, type MalformedClass } from './limits.js';
import { RunHostRequestSchema } from './process-protocol.js';

/*
 * OQ-467 (ruled 2026-11-01 under R-072), PD-CHAT-011: every string a renderer command carries has a bound, and a request
 * past one is `command.malformed` with a headline naming the field and the bound, never the value.
 */

type Def = { type: string; [k: string]: unknown };
const defOf = (s: unknown): Def => (s as { _zod: { def: Def } })._zod.def;
type CheckDef = { check: string; maximum?: number; length?: number };
/**
 * A string's or a list's maximum, read from its checks: `max_length` (`.max()`), and `length_equals` (`.length()`), which
 * bounds it too. zod 4.6 no longer copies a check's maximum into `_zod.bag` (4.5.4 did; measured 2026-11-03 when R-091's
 * audit moved the catalog to `^4.6.6`, past GHSA-mrhx-c7xc-m3w5), so the bag is only the fallback.
 */
const maxOf = (s: unknown): number | undefined => {
  const internals = (s as { _zod: { def: { checks?: Array<{ _zod: { def: CheckDef } }> }; bag?: { maximum?: number } } })._zod;
  const caps = (internals.def.checks ?? [])
    .map(({ _zod: { def } }) => (def.check === 'max_length' ? def.maximum : def.check === 'length_equals' ? def.length : undefined))
    .filter((n): n is number => typeof n === 'number');
  return caps.length > 0 ? Math.min(...caps) : internals.bag?.maximum;
};
/** A schema that carries a JSON-length bound (`jsonBounded`) — the one place an open-shaped `z.unknown()` may sit under. */
const jsonBound = isJsonBounded;

/**
 * Walks a schema and lists every string with no maximum, every array with no maximum, and every `unknown` that is not
 * under a JSON-length bound — each as `kind|field.path`. Discriminated members are named by their `kind` (or `name`,
 * `action`) so a failure says which command it is.
 */
function unbounded(schema: unknown, path = '', underJsonBound = false, out: string[] = []): string[] {
  const def = defOf(schema);
  const bounded = underJsonBound || jsonBound(schema);
  switch (def.type) {
    case 'string': if (maxOf(schema) === undefined) out.push(`${path} (string)`); break;
    case 'object': for (const [k, v] of Object.entries(def.shape as Record<string, unknown>)) unbounded(v, `${path}.${k}`, bounded, out); break;
    case 'array': if (maxOf(schema) === undefined) out.push(`${path} (array)`); unbounded(def.element, `${path}[]`, bounded, out); break;
    case 'record': unbounded(def.keyType, `${path}{key}`, bounded, out); unbounded(def.valueType, `${path}{}`, bounded, out); break;
    case 'union': for (const [i, o] of (def.options as unknown[]).entries()) {
      const shape = defOf(o).shape as Record<string, unknown> | undefined;
      const tag = shape && ['kind', 'name', 'action', 'op'].map((k) => shape[k]).find((t) => t !== undefined && defOf(t).type === 'literal');
      unbounded(o, `${path}|${tag ? String((defOf(tag).values as unknown[])[0]) : i}`, bounded, out);
    } break;
    case 'optional': case 'nullable': case 'default': case 'readonly': case 'catch': case 'nonoptional': case 'prefault': unbounded(def.innerType, path, bounded, out); break;
    case 'pipe': unbounded(def.in, path, bounded, out); break;
    case 'lazy': unbounded((def.getter as () => unknown)(), path, bounded, out); break;
    case 'unknown': case 'any': if (!bounded) out.push(`${path} (unknown)`); break;
    case 'literal': case 'enum': case 'boolean': case 'number': case 'null': case 'undefined': case 'never': break;
    default: out.push(`${path} (unwalked ${def.type})`);
  }
  return out;
}

describe('OQ-467: every field of the command union carries a bound', () => {
  it('the walk finds no string, list or open-shaped value without one', () => {
    expect(unbounded(CommandRequestSchema)).toEqual([]);
  });

  it('the walk itself sees an unbounded field (it is not vacuously green)', async () => {
    const { z } = await import('zod');
    expect(unbounded(z.object({ a: z.string(), b: z.array(z.string().max(1)), c: z.record(z.string().max(1), z.unknown()) }))).toEqual(['.a (string)', '.b (array)', '.c{} (unknown)']);
    // A refinement is not a JSON bound: only a schema `jsonBounded` made admits an `unknown` beneath it.
    expect(unbounded(z.object({ d: z.unknown() }).refine(() => true))).toEqual(['.d (unknown)']);
    expect(unbounded(jsonBounded(z.object({ d: z.unknown() })))).toEqual([]);
  });

  it('names the ruling\'s figures', () => {
    expect([FREE_TEXT_MAX, PATH_MAX, NAME_MAX, LIST_MAX, DICTATION_AUDIO_MAX_BASE64]).toEqual([1_048_576, 32_767, 1_024, 1_024, 33_554_432]);
  });
});

const parse = (req: unknown) => CommandRequestSchema.safeParse(req);
const headlineOf = (req: unknown): string => {
  const r = parse(req);
  if (r.success) throw new Error('parsed');
  return malformedHeadline(r.error.issues);
};
const image = (base64: string) => ({ name: 'a.png', mediaType: 'image/png', base64, size: 1 });

describe('OQ-467: each class of bound — at, over, under', () => {
  const cases: readonly [string, number, (v: string) => unknown, string][] = [
    ['free text: session.start prompt', FREE_TEXT_MAX, (v) => ({ kind: 'session.start', prompt: v }), 'The prompt is longer than 1,048,576 characters'],
    ['free text: session.prompt prompt', FREE_TEXT_MAX, (v) => ({ kind: 'session.prompt', sessionId: 's', prompt: v }), 'The prompt is longer than 1,048,576 characters'],
    ['free text: the composer draft (PD-CHAT-011)', FREE_TEXT_MAX, (v) => ({ kind: 'composer.writeDraft', text: v }), 'The text is longer than 1,048,576 characters'],
    ['free text: a plan edit', FREE_TEXT_MAX, (v) => ({ kind: 'session.planEdit', sessionId: 's', text: v }), 'The text is longer than 1,048,576 characters'],
    ['free text: an artifact body', FREE_TEXT_MAX, (v) => ({ kind: 'artifacts.save', ref: 'r', body: v }), 'The body is longer than 1,048,576 characters'],
    ['path: a worktree path', PATH_MAX, (v) => ({ kind: 'worktree.probePath', path: v }), 'The path is longer than 32,767 characters'],
    ['path: an external URL', PATH_MAX, (v) => ({ kind: 'shell.openExternal', url: v }), 'The url is longer than 32,767 characters'],
    ['path: an API key', PATH_MAX, (v) => ({ kind: 'providers.save', id: 'p', apiKey: v, baseUrl: null, validate: false }), 'The apiKey is longer than 32,767 characters'],
    ['name: a session id', NAME_MAX, (v) => ({ kind: 'session.resume', sessionId: v }), 'The sessionId is longer than 1,024 characters'],
    ['name: a nested control request', NAME_MAX, (v) => ({ kind: 'session.control', request: { op: 'cancel', sessionId: v } }), 'The request.sessionId is longer than 1,024 characters'],
    ['name: a requirement command workspace is a path', PATH_MAX, (v) => ({ kind: 'requirements', command: { name: 'requirements.board', workspace: v } }), 'The command.workspace is longer than 32,767 characters'],
  ];
  for (const [label, max, make, headline] of cases) {
    it(label, () => {
      expect(parse(make('x'.repeat(max - 1))).success).toBe(true);
      expect(parse(make('x'.repeat(max))).success).toBe(true);
      expect(headlineOf(make('x'.repeat(max + 1)))).toBe(headline);
    });
  }

  it('an image attachment past the audio bound is refused naming the field, and the other fields stay valid (PD-CHAT-011)', () => {
    expect(parse({ kind: 'session.start', prompt: 'p', attachments: [image('A'.repeat(DICTATION_AUDIO_MAX_BASE64))] }).success).toBe(true);
    expect(headlineOf({ kind: 'session.start', prompt: 'p', attachments: [image('A'), image('A'.repeat(DICTATION_AUDIO_MAX_BASE64 + 1))] })).toBe('The attachments[1].base64 is longer than 33,554,432 characters');
  });

  it('a list past its count is refused as items, not characters', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);
    expect(parse({ kind: 'initialization.skip', ids: ids(LIST_MAX) }).success).toBe(true);
    expect(headlineOf({ kind: 'initialization.skip', ids: ids(LIST_MAX + 1) })).toBe('The ids has more than 1,024 items');
    expect(headlineOf({ kind: 'providers.refresh', ids: ids(LIST_MAX + 1) })).toBe('The ids has more than 1,024 items');
  });

  it('config.setField\'s open-shaped patch is held to FREE_TEXT_MAX by its JSON length', () => {
    const patch = (n: number) => ({ runtime: { note: 'x'.repeat(n) } });
    const overhead = jsonLength(patch(0));
    expect(parse({ kind: 'config.setField', patch: patch(FREE_TEXT_MAX - overhead) }).success).toBe(true);
    expect(headlineOf({ kind: 'config.setField', patch: patch(FREE_TEXT_MAX - overhead + 1) })).toBe('The patch is longer than 1,048,576 characters');
  });

  it('a record key past its bound is named as a key, never echoed', () => {
    const key = 'k'.repeat(NAME_MAX + 1);
    const headline = headlineOf({ kind: 'config.setField', patch: { [key]: 1 } });
    expect(headline).toBe('The patch[key] is longer than 1,024 characters');
    expect(headline).not.toContain('kkkk');
  });

  it('OQ-485: the class of a refusal — past a bound, an unknown kind of the request\'s own, or unreadable', () => {
    const classOf = (req: unknown): MalformedClass => {
      const r = parse(req);
      if (r.success) throw new Error('parsed');
      return malformedClass(r.error.issues);
    };
    expect(classOf({ kind: 'session.start', prompt: 'x'.repeat(FREE_TEXT_MAX + 1) })).toBe('past a bound');
    expect(classOf({ kind: 'initialization.skip', ids: Array.from({ length: LIST_MAX + 1 }, (_, i) => `id${i}`) })).toBe('past a bound');
    expect(classOf({ kind: 'config.setField', patch: { ['k'.repeat(NAME_MAX + 1)]: 1 } })).toBe('past a bound');
    expect(classOf({ kind: 'no.such.kind' })).toBe('unknown kind');
    expect(classOf({ kind: 42 })).toBe('unknown kind');
    expect(classOf({})).toBe('unknown kind');
    expect(classOf({ kind: 'session.resume', sessionId: 42 })).toBe('unreadable');
    expect(classOf({ kind: 'session.control', request: { op: 'no.such.op', sessionId: 's' } })).toBe('unreadable');
    expect(classOf(null)).toBe('unreadable');
    expect(classOf('session.start')).toBe('unreadable');
  });

  it('the headline never carries the value, and an issue that is not a bound names its field', () => {
    const secret = `sk-${'s'.repeat(PATH_MAX)}`;
    expect(headlineOf({ kind: 'reauth.submit', sessionId: 's', apiKey: secret })).not.toContain('sk-');
    expect(headlineOf({ kind: 'session.resume', sessionId: 42 })).toBe('The request could not be read: the sessionId is not valid');
    expect(headlineOf({ kind: 'no.such.kind' })).toBe('The request could not be read: the kind is not valid');
    expect(headlineOf(null)).toBe('The request could not be read');
  });
});

describe('OQ-467 / ADR-0044: the relayed prompt is bounded by the same constant on both boundaries', () => {
  const promptMax = (schema: unknown, kind: string): number | undefined => {
    const option = (defOf(schema).options as unknown[]).find((o) => defOf((defOf(o).shape as Record<string, z.ZodType>).kind).values instanceof Array && (defOf((defOf(o).shape as Record<string, z.ZodType>).kind).values as unknown[])[0] === kind);
    return maxOf((defOf(option).shape as Record<string, unknown>).prompt);
  };
  for (const kind of ['session.start', 'session.prompt']) {
    it(kind, () => {
      expect(promptMax(CommandRequestSchema, kind)).toBe(FREE_TEXT_MAX);
      expect(promptMax(RunHostRequestSchema, kind)).toBe(FREE_TEXT_MAX);
    });
  }
});
