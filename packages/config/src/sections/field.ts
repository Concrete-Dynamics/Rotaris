import { isPlainMap, type PlainMap } from '../merge.js';

/**
 * One problem found while reading a merged section: the dotted path is REQ-CONFIG-237's rendering key.
 * Schema problems are fatal (REQ-CONFIG-229); warnings continue (REQ-CONFIG-233).
 */
export interface Problem {
  readonly path: string;
  readonly message: string;
}

export interface ProblemSink {
  readonly errors: Problem[];
  readonly warnings: Problem[];
}

export function typeName(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'mapping';
  return typeof value;
}

/** REQ-CONFIG-020: a value the parser folded to a boolean is un-folded to its lower-cased spelling before a vocabulary check. */
export function vocabularyString(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

export const MISSING_REQUIRED = 'missing required field';

/** A reader over one merged mapping, prefixing every problem with the section's dotted path. */
export class FieldReader {
  constructor(
    readonly value: PlainMap,
    readonly base: string,
    private readonly sink: ProblemSink,
  ) {}

  path(key: string): string {
    return this.base === '' ? key : `${this.base}.${key}`;
  }
  error(key: string, message: string): void {
    this.sink.errors.push({ path: this.path(key), message });
  }
  warn(key: string, message: string): void {
    this.sink.warnings.push({ path: this.path(key), message });
  }
  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.value, key);
  }
  raw(key: string): unknown {
    return this.value[key];
  }
  /** REQ-CONFIG-233: an unknown key inside a merged section warns and contributes nothing. */
  warnUnknown(known: readonly string[]): void {
    for (const key of Object.keys(this.value)) if (!known.includes(key)) this.warn(key, `unknown key '${key}' is not recognised by this build and contributes nothing`);
  }
  /** REQ-CONFIG-183: under `requirements:` an unknown key is fatal. */
  rejectUnknown(known: readonly string[]): void {
    for (const key of Object.keys(this.value)) if (!known.includes(key)) this.error(key, `unknown key '${key}' is not recognised by this build`);
  }

  bool(key: string, dflt: boolean): boolean {
    const v = this.value[key];
    if (v === undefined || v === null) return dflt;
    if (typeof v === 'boolean') return v;
    this.error(key, `must be a boolean, got ${typeName(v)}`);
    return dflt;
  }
  boolOrNull(key: string): boolean | null {
    const v = this.value[key];
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v;
    this.error(key, `must be a boolean or null, got ${typeName(v)}`);
    return null;
  }
  int(key: string, dflt: number, bounds: { min?: number; max?: number } = {}): number {
    const v = this.value[key];
    if (v === undefined || v === null) return dflt;
    const n = this.integer(key, v, bounds);
    return n === null ? dflt : n;
  }
  intOrNull(key: string, bounds: { min?: number; max?: number } = {}): number | null {
    const v = this.value[key];
    if (v === undefined || v === null) return null;
    return this.integer(key, v, bounds);
  }
  private integer(key: string, v: unknown, bounds: { min?: number; max?: number }): number | null {
    if (typeof v !== 'number' || !Number.isInteger(v)) { this.error(key, `must be an integer, got ${typeof v === 'number' ? String(v) : typeName(v)}`); return null; }
    if (bounds.min !== undefined && v < bounds.min) { this.error(key, `must be at least ${bounds.min}, got ${v}`); return null; }
    if (bounds.max !== undefined && v > bounds.max) { this.error(key, `must be at most ${bounds.max}, got ${v}`); return null; }
    return v;
  }
  float(key: string, dflt: number, bounds: { min?: number; max?: number; exclusiveMin?: number } = {}): number {
    const v = this.value[key];
    if (v === undefined || v === null) return dflt;
    const n = this.number(key, v, bounds);
    return n === null ? dflt : n;
  }
  floatOrNull(key: string, bounds: { min?: number; max?: number; exclusiveMin?: number } = {}): number | null {
    const v = this.value[key];
    if (v === undefined || v === null) return null;
    return this.number(key, v, bounds);
  }
  private number(key: string, v: unknown, bounds: { min?: number; max?: number; exclusiveMin?: number }): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.error(key, `must be a number, got ${typeName(v)}`); return null; }
    if (bounds.exclusiveMin !== undefined && v <= bounds.exclusiveMin) { this.error(key, `must be greater than ${bounds.exclusiveMin}, got ${v}`); return null; }
    if (bounds.min !== undefined && v < bounds.min) { this.error(key, `must be at least ${bounds.min}, got ${v}`); return null; }
    if (bounds.max !== undefined && v > bounds.max) { this.error(key, `must be at most ${bounds.max}, got ${v}`); return null; }
    return v;
  }
  string(key: string, dflt: string): string {
    const v = this.value[key];
    if (v === undefined || v === null) return dflt;
    if (typeof v === 'string') return v;
    this.error(key, `must be a string, got ${typeName(v)}`);
    return dflt;
  }
  stringOrNull(key: string): string | null {
    const v = this.value[key];
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v;
    this.error(key, `must be a string or null, got ${typeName(v)}`);
    return null;
  }
  requiredString(key: string): string | null {
    const v = this.value[key];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) { this.error(key, MISSING_REQUIRED); return null; }
    if (typeof v === 'string') return v;
    this.error(key, `must be a string, got ${typeName(v)}`);
    return null;
  }
  /** A closed vocabulary; the folded boolean spellings are un-folded first (REQ-CONFIG-020). */
  vocabulary<T extends string>(key: string, dflt: T, accepted: readonly T[], opts: { normalise?: 'none' | 'trim-lower' } = {}): T {
    const v = this.value[key];
    if (v === undefined || v === null) return dflt;
    const text = vocabularyString(v);
    const candidate = text === null ? null : opts.normalise === 'trim-lower' ? text.trim().toLowerCase() : text;
    if (candidate !== null && (accepted as readonly string[]).includes(candidate)) return candidate as T;
    this.error(key, `'${text ?? typeName(v)}' is not an accepted value; expected one of: ${accepted.join(', ')}`);
    return dflt;
  }
  vocabularyOrNull<T extends string>(key: string, accepted: readonly T[]): T | null {
    const v = this.value[key];
    if (v === undefined || v === null) return null;
    const text = vocabularyString(v);
    if (text !== null && (accepted as readonly string[]).includes(text)) return text as T;
    this.error(key, `'${text ?? typeName(v)}' is not an accepted value; expected one of: ${accepted.join(', ')}`);
    return null;
  }
  stringList(key: string, dflt: readonly string[] = []): readonly string[] {
    const v = this.value[key];
    if (v === undefined || v === null) return dflt;
    if (!Array.isArray(v)) { this.error(key, `must be a list of strings, got ${typeName(v)}`); return dflt; }
    const out: string[] = [];
    v.forEach((item, i) => {
      if (typeof item === 'string') out.push(item);
      else this.error(`${key}.${i}`, `must be a string, got ${typeName(item)}`);
    });
    return out;
  }
  mappingOrNull(key: string): PlainMap | null {
    const v = this.value[key];
    if (v === undefined || v === null) return null;
    if (isPlainMap(v)) return v;
    this.error(key, `must be a mapping, got ${typeName(v)}`);
    return null;
  }
  stringMapOrNull(key: string): Readonly<Record<string, string>> | null {
    const map = this.mappingOrNull(key);
    if (map === null) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'string') out[k] = v;
      else this.error(`${key}.${k}`, `must be a string, got ${typeName(v)}`);
    }
    return out;
  }
  stringListMapOrNull(key: string): Readonly<Record<string, readonly string[]>> | null {
    const map = this.mappingOrNull(key);
    if (map === null) return null;
    const out: Record<string, readonly string[]> = {};
    for (const [k, v] of Object.entries(map)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v as string[];
      else this.error(`${key}.${k}`, `must be a list of strings, got ${typeName(v)}`);
    }
    return out;
  }
}

/** A section's merged value as a mapping, or a fatal problem when the file states something else. */
export function sectionMap(value: unknown, path: string, sink: ProblemSink): PlainMap {
  if (value === undefined || value === null) return {};
  if (isPlainMap(value)) return value;
  sink.errors.push({ path, message: `must be a mapping, got ${typeName(value)}` });
  return {};
}
