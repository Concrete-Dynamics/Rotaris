import type { AgentRecord } from '@rotaris/contracts';

/**
 * The delegation tree's rows, depth-first (REQ-MONITOR-036/037), apart from the component that draws them: `agents.ts`
 * orders its agents by them, and `AgentTree.tsx` imports `agents.ts`, so the rows living in the component made an import
 * cycle (R-091). `AgentTree.tsx` re-exports both names.
 */
export interface TreeRow {
  readonly agent: AgentRecord;
  readonly prefix: string;
  readonly depth: number;
  readonly hasChildren: boolean;
}

/** REQ-MONITOR-036/037: depth-first; an agent whose parent is unknown or the run itself is a root row. */
export function treeRows(agents: readonly AgentRecord[], collapsed: ReadonlySet<string> = new Set()): TreeRow[] {
  const ids = new Set(agents.map((a) => a.id));
  const byParent = new Map<string, AgentRecord[]>();
  for (const a of agents) {
    const parent = ids.has(a.parentId) ? a.parentId : '';
    byParent.set(parent, [...(byParent.get(parent) ?? []), a]);
  }
  const out: TreeRow[] = [];
  const visit = (parent: string, depth: number, ancestorLines: boolean[]) => {
    const kids = byParent.get(parent) ?? [];
    kids.forEach((a, i) => {
      const last = i === kids.length - 1;
      const prefix = depth === 0 ? '' : `${ancestorLines.map((l) => (l ? '│  ' : '   ')).join('')}${last ? '└─ ' : '├─ '}`;
      const hasChildren = (byParent.get(a.id) ?? []).length > 0;
      out.push({ agent: a, prefix, depth, hasChildren });
      if (hasChildren && !collapsed.has(a.id)) visit(a.id, depth + 1, [...ancestorLines, !last]);
    });
  };
  visit('', 0, []);
  return out;
}
