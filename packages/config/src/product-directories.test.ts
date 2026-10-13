import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { CODE_INTELLIGENCE_MARKER_SEGMENTS } from './mcp/code-intelligence.js';
import { PRODUCT_DIRECTORIES_UNIT } from './index.js';

describe('PD-TOOLS-012 revision 2: the product statement every agent receives', () => {
  const marker = CODE_INTELLIGENCE_MARKER_SEGMENTS[0]!;

  it('names both directories from their single sources and carries the directive\'s four points', () => {
    // (a) the two directories and what they hold, "where present"
    expect(PRODUCT_DIRECTORIES_UNIT).toContain(`where present, \`${WORKSPACE_SCOPE_DIR}/\` holds this application's own state and \`${marker}/\` its code-intelligence runtime's project data; neither belongs to the user's project.`);
    // (b) the lines the application writes, the marker's only at a repository's top level
    expect(PRODUCT_DIRECTORIES_UNIT).toContain(`\`${WORKSPACE_SCOPE_DIR}/\` in the workspace's \`.gitignore\``);
    expect(PRODUCT_DIRECTORIES_UNIT).toContain(`\`${marker}/\` in the repository's \`info/exclude\`, only at a repository's top level`);
    // ... "so elsewhere version control may list it as untracked" (point (b)'s last words; the bundle's review, D4's
    // `git check-ignore` probes #281 to #286 being the agents' own way of finding that out)
    expect(PRODUCT_DIRECTORIES_UNIT).toContain(`only at a repository's top level, so elsewhere version control may list \`${marker}/\` as untracked)`);
    // (c) hidden from the file tools, shown by a terminal
    expect(PRODUCT_DIRECTORIES_UNIT).toContain('glob, grep and directory listings hide them; a terminal shows them.');
    // (d) left out of what the agent writes, and not counted as changes
    expect(PRODUCT_DIRECTORIES_UNIT).toContain('keep them out of documents, reports, findings, answers and project memories, and do not count them as changes.');
  });

  it('its source writes neither name as a literal, and it stays bounded', () => {
    const source = readFileSync(new URL('./product-directories.ts', import.meta.url), 'utf8');
    expect(source).not.toContain(`'${WORKSPACE_SCOPE_DIR}`);
    expect(source).not.toContain(marker);
    // the ruling priced it at about 80 tokens a request; at 662 characters it is nearer 165 (reported in PD-TOOLS-012); a bound, so it cannot creep
    expect(PRODUCT_DIRECTORIES_UNIT.length).toBeLessThan(680);
  });
});
