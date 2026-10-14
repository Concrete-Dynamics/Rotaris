/**
 * PD-LIBRARY-003 (d) and revision 2 (c): an artifact document's leading frontmatter block, rendered from its `artifacts` row
 * exactly as the engine renders it from the record (`renderFrontmatter`, `packages/engine/src/artifacts/sidecar.ts`), so a
 * proof or the live run can hold a saved document's block to the whole rendering — kind, tags and every optional line
 * included — rather than to a handful of lines. `artifact-frontmatter.test.ts` pins this against the engine's own function.
 */

/** The engine's `yamlScalar`: JSON quoting, with U+2028 and U+2029 written as their escapes. */
function yamlScalar(value) {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * @param {Record<string, unknown>} row an `artifacts` row as the store holds it (snake_case columns, `tags` as JSON text)
 * @returns {string} the block, both fences and the closing line break included
 */
export function frontmatterOfRow(row) {
  const s = (name) => /** @type {string | null} */ (row[name] ?? null);
  const front = [
    `id: ${yamlScalar(s('id'))}`,
    `slug: ${yamlScalar(s('slug'))}`,
    `title: ${yamlScalar(s('title'))}`,
    `kind: ${yamlScalar(s('kind'))}`,
    `status: ${yamlScalar(s('status'))}`,
    `created_at: ${yamlScalar(s('created_at'))}`,
  ];
  for (const [column, key] of [['edited_at', 'edited_at'], ['source_task_id', 'source_task_id'], ['canonical_name', 'canonical_name'], ['source_persona', 'source_persona']]) {
    if (s(column) !== null) front.push(`${key}: ${yamlScalar(s(column))}`);
  }
  if ((s('created_by') ?? '') !== '') front.push(`created_by: ${yamlScalar(s('created_by'))}`);
  for (const column of ['timeline_event_id', 'conversation_id']) if (s(column) !== null) front.push(`${column}: ${yamlScalar(s(column))}`);
  const tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags ?? []);
  if (tags.length > 0) front.push(`tags: [${tags.map(yamlScalar).join(', ')}]`);
  if (s('supersedes') !== null) front.push(`supersedes: ${yamlScalar(s('supersedes'))}`);
  if (s('superseded_by') !== null) front.push(`superseded_by: ${yamlScalar(s('superseded_by'))}`);
  return `${['---', ...front, '---'].join('\n')}\n`;
}

/** The document's leading block, both fences and the closing line break included; '' when it opens with none. */
export function leadingFrontmatter(document) {
  return /^---\n[\s\S]*?\n---\n/.exec(document)?.[0] ?? '';
}
