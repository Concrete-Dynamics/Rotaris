import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { CODE_INTELLIGENCE_MARKER_SEGMENTS } from './mcp/code-intelligence.js';

/**
 * PD-TOOLS-012 revision 2 (OQ-230, ruled under the owner's delegation, R-072, 2026-10-07): the product statement every agent
 * of a session receives as its last always-active context unit, after REQ-WORKSPACE-060's four, whatever prompt its persona
 * carries and whether or not context files are injected.
 *
 * Why: the final duress run at `a68f121` (finding D4) found the file tools clean — both directories hidden (REQ-TOOLS-140,
 * PD-TOOLS-012) — and the terminal carrying them into the user's verification report, the answer and a project memory, while a
 * docs-writer, which holds no terminal, wrote that they were absent
 * (docs/defects/fixed/the-product-directories-reach-the-users-report-answer-and-memory-through-the-terminal.md).
 *
 * The two names come from their single sources — the workspace scope directory and the first segment of REQ-MCP-116's marker
 * path — and are never written here as literals. The statement carries the directive's four points: what the directories hold,
 * the lines that keep them out of version control, that the file tools hide them and a terminal shows them, and that unless
 * the task concerns them they stay out of what the agent writes. It is one constant, so every prompt carries the same
 * characters in the same order.
 */
const scope = `${WORKSPACE_SCOPE_DIR}/`;
const marker = `${CODE_INTELLIGENCE_MARKER_SEGMENTS[0] as string}/`;

export const PRODUCT_DIRECTORIES_UNIT: string = [
  `Product directories: where present, \`${scope}\` holds this application's own state and \`${marker}\` its code-intelligence runtime's project data; neither belongs to the user's project.`,
  `The application keeps them out of version control with lines it writes itself (\`${scope}\` in the workspace's \`.gitignore\`; \`${marker}\` in the repository's \`info/exclude\`, only at a repository's top level).`,
  'glob, grep and directory listings hide them; a terminal shows them.',
  'Unless your task concerns them, keep them out of documents, reports, findings, answers and project memories, and do not count them as changes.',
].join(' ');
