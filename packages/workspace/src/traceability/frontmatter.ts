/**
 * The hand-written frontmatter reader (ADR-0040 #2). It shares nothing with ADR-0036's YAML library: the grammar
 * REQ-TRACE-008 to REQ-TRACE-011 fix is not YAML, and REQ-TRACE-013 forbids the dependency so the parser runs
 * wherever the engine is embedded.
 *
 * - The block opens only when line 1 strips to exactly `---`, and closes at the next line that does (008).
 * - A block that never closes means the document has NO frontmatter — no requirement, no diagnostic (009).
 * - A field line opens with a letter, continues with letters, digits, underscores or hyphens, then a colon; any
 *   other line continues the field most recently opened, its stripped text appended with one space (010).
 * - A value is everything after the first colon, stripped; one matching outer quote pair is removed and nothing
 *   else is processed (011).
 */
export interface FrontmatterField { readonly key: string; readonly value: string }
export interface Frontmatter {
  readonly fields: readonly FrontmatterField[];
  /** 0-based index of the first body line — the line after the closing `---`. */
  readonly bodyStart: number;
}

const FIELD = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/;

/** Strip one matching outer pair of single or double quotes when the value is at least two characters long (011). */
export function stripOuterQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
  }
  return value;
}

/** Read the frontmatter of a document given as normalised (LF) lines; `null` when the document carries none. */
export function readFrontmatter(lines: readonly string[]): Frontmatter | null {
  if (lines.length === 0 || lines[0]!.trim() !== '---') return null;
  const fields: { key: string; parts: string[] }[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.trim() === '---') {
      return { fields: fields.map((f) => ({ key: f.key, value: stripOuterQuotes(f.parts.join(' ')) })), bodyStart: i + 1 };
    }
    const m = FIELD.exec(line);
    if (m) {
      fields.push({ key: m[1]!, parts: [m[2]!.trim()] });
      continue;
    }
    const continuation = line.trim();
    const open = fields[fields.length - 1];
    // A continuation before any field has opened belongs to nothing; an empty continuation adds no text.
    if (open && continuation.length > 0) open.parts.push(continuation);
  }
  return null;
}

/** The first value for a key; frontmatter keys are case-sensitive (the schema names them in lower case). */
export function fieldValue(fm: Frontmatter, key: string): string | undefined {
  for (const f of fm.fields) if (f.key === key) return f.value;
  return undefined;
}
