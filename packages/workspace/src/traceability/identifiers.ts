/**
 * The identifier scheme (REQ-TRACE-022 to REQ-TRACE-027): `<PREFIX>-<digits>` and nothing else, no leading zeros,
 * no upper bound; the prefix declared by the layout's `id_prefix` and never inferred from the documents (022).
 * The generated symbol is the identifier with its separator replaced by an underscore (§Artifact item 5).
 */
export interface IdentifierListParse {
  /** The list form was used (`[...]`). */
  readonly list: boolean;
  /** Tokens that matched the identifier form, in declaration order. */
  readonly ids: readonly string[];
  /** Tokens that did not match, as written. */
  readonly invalid: readonly string[];
  /** The list form with no parts at all (027: an error naming the document). */
  readonly emptyList: boolean;
}

const LIST = /^\[(.*)\]$/s;

/** `^<PREFIX>-(0|[1-9][0-9]*)$` for the project's prefix. */
export function identifierPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}-(0|[1-9][0-9]*)$`);
}

export function parseIdentifier(value: string, prefix: string): number | null {
  const m = identifierPattern(prefix).exec(value);
  return m ? Number(m[1]) : null;
}

export function identifierOf(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

/** `REQ-101` → `REQ_101` (§Generated artifact, item 5). */
export function symbolName(id: string): string {
  return id.replace('-', '_');
}

/** One identifier, or a bracketed comma-separated list, split on commas, stripped, empty parts dropped (019, 027). */
export function parseIdentifierList(value: string, prefix: string): IdentifierListParse {
  const m = LIST.exec(value.trim());
  const tokens = m ? m[1]!.split(',').map((t) => t.trim()).filter((t) => t.length > 0) : [value.trim()];
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) (parseIdentifier(t, prefix) === null ? invalid : ids).push(t);
  return { list: m !== null, ids, invalid, emptyList: m !== null && tokens.length === 0 };
}

/**
 * REQ-TRACE-021: legacy identifiers collected case-insensitively (upper-cased). After the scan, an entry claimed by
 * exactly one requirement resolves to its number; one claimed by two or more resolves to nothing (`null`).
 */
export function buildLegacyAliases(records: readonly { readonly legacyId?: string; readonly number: number }[]): Map<string, number | null> {
  const claims = new Map<string, number[]>();
  for (const r of records) {
    if (r.legacyId === undefined || r.legacyId.length === 0) continue;
    const key = r.legacyId.toUpperCase();
    const list = claims.get(key) ?? [];
    list.push(r.number);
    claims.set(key, list);
  }
  const out = new Map<string, number | null>();
  for (const [key, numbers] of claims) out.set(key, numbers.length === 1 ? numbers[0]! : null);
  return out;
}

/** REQ-TRACE-070's comment-form token: a canonical identifier, or hyphen-separated alphanumeric segments. */
export const LEGACY_TOKEN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
