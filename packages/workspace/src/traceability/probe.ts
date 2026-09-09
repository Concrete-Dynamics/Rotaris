import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fieldValue, readFrontmatter } from './frontmatter.js';
import { decodeUtf8, normaliseLineEndings } from './hashes.js';
import type { ResolvedLayout } from './layout.js';
import { enumerateStore } from './store.js';

/**
 * Store probing (REQ-TRACE-177 to REQ-TRACE-180): whether a repository keeps a store OF THIS KIND, decided by
 * reading and never by a directory existing. The probe walks in the store scan's path order, normalises each
 * document, passes over any it cannot read, computes no hashes, produces no requirements, writes nothing, and stops
 * at the first document that declares a requirement identifier. Neither a document cap nor a time limit applies.
 */
export interface ProbeResult {
  /** Some document under the store declares a requirement identifier. */
  readonly declaresIdentifier: boolean;
  /** Documents carrying frontmatter that is NOT an identifier block — positive beside `false` above is the case the probe exists for. */
  readonly frontmatterWithoutIdentifier: number;
  readonly inspected: number;
}

export function probeStore(root: string, layout: ResolvedLayout): ProbeResult {
  let exists = false;
  try { exists = statSync(join(root, layout.requirementsDir)).isDirectory(); } catch { exists = false; }
  if (!exists) return { declaresIdentifier: false, frontmatterWithoutIdentifier: 0, inspected: 0 };
  let frontmatterWithoutIdentifier = 0;
  let inspected = 0;
  for (const path of enumerateStore(root, layout)) {
    let text: string;
    try { text = normaliseLineEndings(decodeUtf8(readFileSync(join(root, path)))); } catch { continue; }
    inspected += 1;
    const fm = readFrontmatter(text.split('\n'));
    if (fm === null) continue;
    if (fieldValue(fm, 'req-id') !== undefined) return { declaresIdentifier: true, frontmatterWithoutIdentifier, inspected };
    frontmatterWithoutIdentifier += 1;
  }
  return { declaresIdentifier: false, frontmatterWithoutIdentifier, inspected };
}
