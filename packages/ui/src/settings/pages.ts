/**
 * PD-CONFIG-012 (R-105): the Settings view's pages. Setup stands first and alone; twelve pages follow under four
 * headings, in the order a run meets what they hold — what an agent is given before it starts, what it may do while it
 * runs, what is kept and checked once it has ended — and then what belongs to this application and not to the workspace.
 *
 * REQ-CONFIG-269's thirteen category identifiers stay the vocabulary a notice, a command or a stored preference
 * addresses Settings by: each names the page that holds what the category held (`CATEGORY_PAGE`).
 */
export const SETTINGS_SETUP_PAGE = { id: 'setup', label: 'Setup' } as const;
export const SETTINGS_PAGE_GROUPS = [
  { id: 'before', label: 'Before a run', pages: [
    { id: 'models', label: 'Models' },
    { id: 'personas', label: 'Personas' },
    { id: 'instructions', label: 'Instructions' },
    { id: 'initialization', label: 'Initialization' },
  ] },
  { id: 'during', label: 'While it runs', pages: [
    { id: 'delegation', label: 'Delegation' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'tools', label: 'Tools' },
  ] },
  { id: 'after', label: 'After it ends', pages: [
    { id: 'review', label: 'Review' },
    { id: 'store', label: 'Session store' },
    { id: 'traceability', label: 'Traceability' },
  ] },
  { id: 'application', label: 'This application', pages: [
    { id: 'appearance', label: 'Appearance' },
    { id: 'about', label: 'About' },
  ] },
] as const;
export type SettingsPageId = typeof SETTINGS_SETUP_PAGE.id | (typeof SETTINGS_PAGE_GROUPS)[number]['pages'][number]['id'];
/** Setup, then the twelve pages in their order, the groups flattened. */
export const SETTINGS_PAGES: readonly { readonly id: SettingsPageId; readonly label: string }[] = [SETTINGS_SETUP_PAGE, ...SETTINGS_PAGE_GROUPS.flatMap((group) => [...group.pages])];

/** The page that holds what each of REQ-CONFIG-269's categories held. */
export const CATEGORY_PAGE = {
  models: 'models', personas: 'personas', runtime: 'delegation', interface: 'appearance', display: 'appearance',
  skills: 'instructions', instructions: 'instructions', hooks: 'tools', mcp: 'tools', plugins: 'tools', tools: 'tools',
  project: 'store', about: 'about',
} as const satisfies Readonly<Record<string, SettingsPageId>>;

/** A page identifier or a category identifier, as the page it opens; `null` for anything else. */
export function settingsPageFor(address: string | null | undefined): SettingsPageId | null {
  if (address == null) return null;
  if (SETTINGS_PAGES.some((p) => p.id === address)) return address as SettingsPageId;
  return (CATEGORY_PAGE as Readonly<Record<string, SettingsPageId>>)[address] ?? null;
}

/**
 * Clause 6: the names a person looks a setting up by, each with the page that holds it. The names are the labels the
 * pages draw; `find-index.test.ts` holds every one of them to a label that is drawn.
 */
export const SETTINGS_INDEX: readonly { readonly label: string; readonly page: SettingsPageId }[] = [
  { label: 'Providers', page: 'models' }, { label: 'Add endpoint', page: 'models' }, { label: 'Model slots', page: 'models' }, { label: 'Reasoning strength', page: 'models' }, { label: 'Dictation', page: 'models' },
  { label: 'Personas', page: 'personas' }, { label: 'Edit scope', page: 'personas' }, { label: 'Playbook catalogue', page: 'personas' },
  { label: 'Instructions', page: 'instructions' }, { label: 'Portable skills', page: 'instructions' }, { label: 'Enable skills', page: 'instructions' },
  { label: 'Project initialization', page: 'initialization' },
  { label: 'Delegation strategy', page: 'delegation' }, { label: 'Run-start mode', page: 'delegation' }, { label: 'Depth cap', page: 'delegation' }, { label: 'Fan-out limit', page: 'delegation' }, { label: 'Per-agent timeout', page: 'delegation' }, { label: 'Iteration cap', page: 'delegation' }, { label: 'Compression threshold', page: 'delegation' }, { label: 'Circuit breaker', page: 'delegation' }, { label: 'Keep going', page: 'delegation' }, { label: 'Memory diagnostics', page: 'delegation' },
  { label: 'Permission mode', page: 'permissions' }, { label: 'Allow outside workspace', page: 'permissions' }, { label: 'Sandbox mode', page: 'permissions' }, { label: 'Writable roots', page: 'permissions' }, { label: 'Allow network in sandbox', page: 'permissions' }, { label: 'Egress policy', page: 'permissions' }, { label: 'Allowed hosts', page: 'permissions' }, { label: 'Denied hosts', page: 'permissions' },
  { label: 'MCP Servers', page: 'tools' }, { label: 'Web search', page: 'tools' }, { label: 'Code intelligence', page: 'tools' }, { label: 'Hooks', page: 'tools' }, { label: 'Tools', page: 'tools' }, { label: 'Plugins', page: 'tools' },
  { label: 'Improvement loop', page: 'review' }, { label: 'Improvement analysis timeout', page: 'review' },
  { label: 'Back up session store', page: 'store' }, { label: 'Restore session store', page: 'store' },
  { label: 'Requirement traceability', page: 'traceability' },
  { label: 'Theme', page: 'appearance' }, { label: 'Reduce motion', page: 'appearance' }, { label: 'Agent pop-out', page: 'appearance' }, { label: 'Reset panel sizes', page: 'appearance' }, { label: 'Auto-collapse older tool outputs', page: 'appearance' }, { label: 'Group consecutive tool calls', page: 'appearance' }, { label: 'Show reasoning bodies', page: 'appearance' }, { label: 'Show tool results', page: 'appearance' }, { label: 'Result lines', page: 'appearance' }, { label: 'Show tool inputs', page: 'appearance' },
  { label: 'Version', page: 'about' }, { label: 'Legal documents', page: 'about' }, { label: 'Licensing', page: 'about' }, { label: 'Diagnostics', page: 'about' }, { label: 'Capture level', page: 'about' },
];

/** The settings whose name holds every word typed, in the index's order; nothing for an empty query. At most eight. */
export function findSettings(query: string): readonly { readonly label: string; readonly page: SettingsPageId }[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [];
  return SETTINGS_INDEX.filter((entry) => words.every((w) => entry.label.toLowerCase().includes(w))).slice(0, 8);
}
