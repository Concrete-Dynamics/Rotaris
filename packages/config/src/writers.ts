import { readFileSync } from 'node:fs';
import { isMap, isNode, type Document, type Node, type YAMLMap } from 'yaml';
import { LEGACY_ROLE_ALIASES, VerifierSectionSchema, type DesktopSaveRuntimeKey, type DictationConfigView, type VerifierSection } from '@rotaris/contracts';
import { err, millis, ok, type Result, type Timers } from '@rotaris/kernel';
import { replaceDocument, replaceDocumentSync, type RetryLadder } from '@rotaris/platform';
import { parseConfig, plainOf } from './document.js';
import { overlaySection, type MapOps, type PlainMap } from './merge.js';
import { MODEL_SLOTS, thinkingKeyOf, type ModelSlot, type ReasoningLevel, type RoleReasoning } from './keys.js';
import { validateRuntimeField } from './sections/runtime.js';
import type { DelegationStrategy } from './load.js';

/**
 * ADR-0036's four writers — the bootstrap (REQ-CONFIG-025..030), the scoped per-field path
 * (REQ-CONFIG-441..444), the desktop save (REQ-CONFIG-256..260) and the startup model-preference path
 * (REQ-CONFIG-248..255). None is interchangeable with another; all four edit the parsed document IN PLACE
 * and re-emit it, so comments, blank lines and key order survive (REQ-CONFIG-252), and all four go
 * through ADR-0004's replace primitive. The per-field writer overlays through the loader's own
 * `overlaySection`, here over the YAML tree — the one merge, two adapters.
 *
 * Mode 0644 (REQ-CONFIG-444): applied where the platform has POSIX modes; a no-op on Windows, and stated.
 */
export const CONFIG_FILE_MODE = 0o644;
/** ADR-0004's ladder for a rename over a briefly-held target (Windows, D-06); the domain's own constants. */
export const CONFIG_WRITE_LADDER: RetryLadder = { delays: [millis(20), millis(60), millis(180)] };

export type WriteRefusal =
  | { readonly code: 'unreadable'; readonly file: string; readonly fault: string }
  | { readonly code: 'not-a-mapping'; readonly file: string; readonly fault: string }
  | { readonly code: 'invalid'; readonly file: string; readonly fault: string }
  | { readonly code: 'write-failed'; readonly file: string; readonly fault: string };

export interface WriteOutcome {
  readonly file: string;
  readonly text: string;
}

/**
 * REQ-CONFIG-025: the scope-independent starter document. Its comment header is REQ-WORKSPACE-038's three lines, one
 * fact each: a minimal starting configuration, an override of the built-in personas, models and tool servers, and
 * real models wired up by authenticating a provider in the Settings Models category (REQ-WORKSPACE-152). The wording
 * is the implementation's; the header shipped before 2026-10-03 carried only the second fact
 * (`docs/defects/fixed/the-starter-agents-yaml-header-never-says-models-are-wired-up-by-authenticating-a-provider.md`).
 * After `default_persona` come exactly the twelve explicitly-null keys REQ-CONFIG-025 enumerates (REQ-WORKSPACE-038). The
 * retrospective slot and its companion (PD-LIBRARY-002) are not among them: that directive names neither requirement, so
 * it does not govern the starter, and until 2026-10-06 the starter wrote them as a thirteenth and fourteenth null
 * (`docs/defects/fixed/the-starter-agents-yaml-writes-fourteen-explicit-nulls-where-the-specification-names-twelve.md`).
 * Every one is replace-if-not-null (REQ-CONFIG-041), so the slot still resolves exactly as before.
 */
export function starterDocument(defaultPersona = 'orchestrator'): string {
  return [
    '# A minimal starting configuration for this scope; anything left null or absent is inherited from the layer below.',
    '# Editing it overrides the built-in personas, models and tool servers; sections merge per field, lists whole.',
    '# Real models are wired up by authenticating a provider in the Models category of Settings.',
    `default_persona: ${defaultPersona}`,
    'default_summary_model: null',
    'default_summary_model_thinking: null',
    'large_model: null',
    'large_model_thinking: null',
    'medium_model: null',
    'medium_model_thinking: null',
    'small_model: null',
    'small_model_thinking: null',
    'fallback_model: null',
    'fallback_model_thinking: null',
    'improvement_collector_model: null',
    'improvement_collector_model_thinking: null',
    '',
  ].join('\n');
}

export type BootstrapOutcome = 'written' | 'exists' | 'declined-directory' | 'declined-not-utf8';

/** REQ-CONFIG-026/028: absent or blank → written; a directory or undecodable bytes → declined and reported; never clobbers. */
export function bootstrapConfigFile(file: string, opts: { overwrite?: boolean; defaultPersona?: string } = {}): Result<BootstrapOutcome, WriteRefusal> {
  let bytes: Buffer | null = null;
  try {
    bytes = readFileSync(file);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'EISDIR') return ok('declined-directory');
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return err({ code: 'unreadable', file, fault: String(cause) });
  }
  if (bytes !== null) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return ok('declined-not-utf8'); }
    if (text.trim() !== '' && !opts.overwrite) return ok('exists');
  }
  const r = replaceDocumentSync(file, starterDocument(opts.defaultPersona), { mode: CONFIG_FILE_MODE, createParent: true });
  return r.ok ? ok('written') : err({ code: 'write-failed', file, fault: r.error.detail ?? r.error.headline });
}

/** REQ-CONFIG-442: an unparseable file, or one that is not a mapping, refuses the write naming the file and the fault. */
function openDocument(file: string): Result<{ doc: Document.Parsed; root: YAMLMap | null; existed: boolean }, WriteRefusal> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      const empty = parseConfig('');
      return empty.ok ? ok({ doc: empty.value.doc, root: null, existed: false }) : err({ code: 'unreadable', file, fault: empty.error.reason });
    }
    if (code === undefined) return err({ code: 'unreadable', file, fault: 'the file is not UTF-8 text' });
    return err({ code: 'unreadable', file, fault: String(cause) });
  }
  const parsed = parseConfig(text);
  if (!parsed.ok) return err({ code: 'unreadable', file, fault: `YAML syntax error: ${parsed.error.reason}` });
  if (parsed.value.root === null && parsed.value.topLevelType !== 'null') return err({ code: 'not-a-mapping', file, fault: `top-level content is a ${parsed.value.topLevelType}, not a mapping` });
  return ok({ doc: parsed.value.doc, root: parsed.value.root, existed: true });
}

/** The tree adapter for the shared overlay: keys read from pairs, values set as nodes, lower values cloned. */
function yamlOps(doc: Document): MapOps<YAMLMap> {
  return {
    isMap: (v): v is YAMLMap => isMap(v),
    keys: (m) => m.items.map((p) => String(plainOf(p.key as Node))),
    get: (m, k) => m.get(k, true),
    set: (m, k, v) => { m.set(k, isNode(v) ? v : doc.createNode(v)); },
    clone: (v) => (isNode(v) ? v.clone() : v),
  };
}

function rootOf(doc: Document): YAMLMap {
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never;
  return doc.contents as YAMLMap;
}

/** REQ-CONFIG-441/443: overlay the patch per field, recursively, on the document tree; nothing else moves. */
export function overlayDocument(doc: Document, patch: PlainMap): void {
  const root = rootOf(doc);
  const ops = yamlOps(doc);
  const patchNode = doc.createNode(patch);
  if (isMap(patchNode)) overlaySection(root, patchNode, ops);
}

async function commit(file: string, doc: Document, timers: Timers | undefined): Promise<Result<WriteOutcome, WriteRefusal>> {
  const text = doc.toString({ lineWidth: 0 });
  const r = timers
    ? await replaceDocument(file, text, { mode: CONFIG_FILE_MODE, createParent: true, ladder: CONFIG_WRITE_LADDER, timers })
    : replaceDocumentSync(file, text, { mode: CONFIG_FILE_MODE, createParent: true });
  return r.ok ? ok({ file, text }) : err({ code: 'write-failed', file, fault: r.error.detail ?? r.error.headline });
}

export interface WriterDeps {
  /** ADR-0006: the retry ladder runs on the caller's timers; absent means one synchronous attempt. */
  readonly timers?: Timers;
}

/**
 * The scoped per-field write path (REQ-CONFIG-441..444): the writer for a surface that changes part of a
 * section — the diagnostics toggle, the composer's permission-mode control (REQ-CONFIG-288).
 */
export async function writeConfigFields(file: string, patch: PlainMap, deps: WriterDeps = {}): Promise<Result<WriteOutcome, WriteRefusal>> {
  const opened = openDocument(file);
  if (!opened.ok) return opened;
  // REQ-CONFIG-111: a runtime value a surface writes is validated on assignment, before any file is touched.
  const runtime = patch['runtime'];
  if (runtime !== undefined && runtime !== null && typeof runtime === 'object' && !Array.isArray(runtime)) {
    for (const [key, value] of Object.entries(runtime as PlainMap)) {
      const problems = validateRuntimeField(key, value);
      if (problems.length > 0) return err({ code: 'invalid', file, fault: `${problems[0]!.path}: ${problems[0]!.message}` });
    }
  }
  overlayDocument(opened.value.doc, patch);
  return commit(file, opened.value.doc, deps.timers);
}

/** REQ-LIBRARY-009/063: gate proposals use the running verifier-section schema and the scoped config writer. */
export async function writeVerifierSection(file: string, section: unknown, deps: WriterDeps = {}): Promise<Result<WriteOutcome & { changed: boolean }, WriteRefusal>> {
  const parsed = VerifierSectionSchema.safeParse(section);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return err({ code: 'invalid', file, fault: `verifier.${issue.path.join('.')}: ${issue.message}` });
  }
  const opened = openDocument(file);
  if (!opened.ok) return opened;
  const before = plainOf(opened.value.doc.contents) as PlainMap;
  const current = before['verifier'];
  const currentParsed = VerifierSectionSchema.safeParse(current);
  if (currentParsed.success && JSON.stringify(currentParsed.data) === JSON.stringify(parsed.data)) return ok({ file, text: opened.value.doc.toString({ lineWidth: 0 }), changed: false });
  const written = await writeConfigFields(file, { verifier: parsed.data as VerifierSection }, deps);
  return written.ok ? ok({ ...written.value, changed: true }) : written;
}

export type RoleEditScope = 'workspace' | 'global';

/** One role's field edits at one layer: what `applyRoleEdit` writes into one document. */
export interface RoleFieldEdits {
  /** A model to write; null removes the key (REQ-CONFIG-041); absent leaves the key. */
  readonly model?: string | null;
  readonly thinking?: RoleReasoning | null;
  /** REQ-CONFIG-341: an unset removes the key at the edited scope. */
  readonly unsetModel?: boolean;
  readonly unsetThinking?: boolean;
}

/**
 * REQ-CONFIG-259: "Role edits carry a per-field scope"; REQ-CONFIG-341: an Unset records "a pending unset of (role, field,
 * scope)". One role's edits are held per scope, and each field's edit at a scope is written in that scope's file: a model
 * unset at the workspace and a reasoning unset at the global layer each land where they were made, and so do a model
 * unset at the workspace and a model picked at the global layer (defect note
 * `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md`; until 2026-10-02 one `scope` routed the whole entry,
 * and then one scope per field still dropped the first of two edits of one field at two scopes).
 */
export interface RoleEdit {
  readonly workspace?: RoleFieldEdits;
  readonly global?: RoleFieldEdits;
}

/** The part of a role edit made at `scope`, or undefined when no field was edited there. */
function roleEditAt(edit: RoleEdit, scope: RoleEditScope): RoleFieldEdits | undefined {
  const at = edit[scope];
  if (at === undefined) return undefined;
  const model = at.model !== undefined || at.unsetModel === true;
  const thinking = at.thinking !== undefined || at.unsetThinking === true;
  return model || thinking ? at : undefined;
}

export interface DesktopSave {
  readonly slots?: Partial<Record<ModelSlot, string | null>>;
  readonly slotThinking?: Partial<Record<ModelSlot, ReasoningLevel | null>>;
  /** REQ-CONFIG-256's closed list of runtime keys (`DESKTOP_SAVE_RUNTIME_KEYS`, PD-CONFIG-003 revision 2). */
  readonly runtime?: Partial<Record<DesktopSaveRuntimeKey, unknown>>;
  readonly circuitBreakerEnabled?: boolean;
  readonly compressorThresholdPercentage?: number;
  readonly delegationStrategy?: DelegationStrategy;
  readonly display?: PlainMap;
  /**
   * REQ-CONFIG-256/258 (ADR-0063): the three `skills` keys, into the WORKSPACE file only. A map value of
   * `null` removes that skill's key, which is how REQ-CONFIG-258's sparse rule reaches the document — the
   * screen decides which of the two a baseline choice is, because only it knows whether a lower layer
   * states a policy for that skill.
   */
  readonly skills?: {
    readonly enabled?: boolean | undefined;
    readonly overrides?: Readonly<Record<string, string | null>> | undefined;
    readonly invocationOverrides?: Readonly<Record<string, string | null>> | undefined;
  };
  /**
   * PD-WORKSPACE-002: the `instructions.overrides` map, into the WORKSPACE file only. A map value of
   * `null` removes that file's key, which is how the sparse rule reaches the document — the screen
   * decides which of the two a baseline choice is, because only it knows whether a lower layer
   * states a policy for that file.
   */
  readonly instructions?: {
    readonly overrides?: Readonly<Record<string, string | null>> | undefined;
  };
  /** OQ-457: the changed `dictation:` keys, into the WORKSPACE file only. A value of `null` removes that key. */
  readonly dictation?: { readonly [K in keyof DictationConfigView]?: string | null | undefined };
  readonly roles?: Readonly<Record<string, RoleEdit>>;
}

export interface DesktopSaveOutcome {
  readonly workspace: WriteOutcome;
  readonly global: WriteOutcome | null;
}

const SIX_SECURITY_KEYS = ['sandbox_mode', 'sandbox_writable_roots', 'sandbox_allow_network', 'network_egress_policy', 'network_allowed_hosts', 'network_denied_hosts'] as const;

function ensureMapping(root: YAMLMap, key: string, doc: Document): YAMLMap {
  const existing = root.get(key, true);
  // REQ-CONFIG-257: a pre-existing non-mapping value at a section the save writes into is replaced with a fresh mapping.
  if (isMap(existing)) return existing;
  const fresh = doc.createNode({}) as YAMLMap;
  root.set(key, fresh);
  return fresh;
}

function applyRoleEdit(doc: Document, root: YAMLMap, role: string, edit: RoleFieldEdits): void {
  const canonical = LEGACY_ROLE_ALIASES[role] ?? role;
  const personas = ensureMapping(root, 'personas', doc);
  // REQ-CONFIG-251: a legacy alias key whose canonical name is now present is deleted.
  for (const [alias, target] of Object.entries(LEGACY_ROLE_ALIASES)) if (target === canonical && personas.has(alias)) personas.delete(alias);
  const entry = ensureMapping(personas, canonical, doc);
  // A written null overrides nothing (REQ-CONFIG-041): a role-model edit carrying null — the model
  // selector's baseline option — is the unset spelling at the edited scope and removes the key, the
  // same discipline as unsetModel. Writing `model: null` literally would produce an entry the persona
  // reader rejects (REQ-CONFIG-098 requires name and model as strings) and fail the whole load.
  if (edit.unsetModel || edit.model === null) entry.delete('model');
  else if (edit.model !== undefined) entry.set('model', doc.createNode(edit.model));
  if (edit.unsetThinking) entry.delete('thinking');
  else if (edit.thinking !== undefined) entry.set('thinking', doc.createNode(edit.thinking));
  if (entry.items.length === 0) personas.delete(canonical);
  if (personas.items.length === 0) root.delete('personas');
}

/**
 * The desktop save (REQ-CONFIG-256..260): the enumerated key set into the workspace file — a slot only when
 * non-empty, a null companion removing the key — and the global file additionally for global-scoped role
 * edits. Validated before any file is touched (REQ-CONFIG-260): the first complaint, one sentence.
 */
export async function saveDesktop(files: { workspace: string; global: string }, save: DesktopSave, deps: WriterDeps = {}): Promise<Result<DesktopSaveOutcome, WriteRefusal>> {
  // Validation first, over every runtime value the save carries (the six security values included).
  for (const [key, value] of Object.entries(save.runtime ?? {})) {
    const problems = validateRuntimeField(key, value);
    if (problems.length > 0) return err({ code: 'invalid', file: files.workspace, fault: (SIX_SECURITY_KEYS as readonly string[]).includes(key) ? problems[0]!.message.split('\n')[0]! : `${problems[0]!.path}: ${problems[0]!.message}` });
  }
  if (save.compressorThresholdPercentage !== undefined && (!Number.isInteger(save.compressorThresholdPercentage) || save.compressorThresholdPercentage < 1 || save.compressorThresholdPercentage > 100)) {
    return err({ code: 'invalid', file: files.workspace, fault: 'compressor.threshold_percentage: must be an integer between 1 and 100' });
  }
  const ws = openDocument(files.workspace);
  if (!ws.ok) return ws.error.code === 'not-a-mapping' ? err({ ...ws.error, fault: `the workspace agents.yaml is not a mapping (${ws.error.fault})` }) : ws;
  // REQ-CONFIG-259/341: each field at the layer it was edited at — the workspace's part of every role edit, then the global's.
  const atScope = (scope: RoleEditScope) => Object.entries(save.roles ?? {}).flatMap(([role, e]) => { const part = roleEditAt(e, scope); return part === undefined ? [] : [[role, part] as const]; });
  const workspaceEdits = atScope('workspace');
  const globalEdits = atScope('global');
  let global: { doc: Document.Parsed } | null = null;
  if (globalEdits.length > 0) {
    const g = openDocument(files.global);
    if (!g.ok) return g.error.code === 'not-a-mapping' ? err({ ...g.error, fault: `the global agents.yaml is not a mapping (${g.error.fault})` }) : g;
    global = { doc: g.value.doc };
  }

  const doc = ws.value.doc;
  const root = rootOf(doc);
  for (const slot of MODEL_SLOTS) {
    const value = save.slots?.[slot];
    if (value !== undefined && value !== '') root.set(slot, doc.createNode(value));
    const thinking = save.slotThinking?.[slot];
    if (thinking === null) root.delete(thinkingKeyOf(slot));
    else if (thinking !== undefined) root.set(thinkingKeyOf(slot), doc.createNode(thinking));
  }
  if (save.runtime && Object.keys(save.runtime).length > 0) {
    const runtime = ensureMapping(root, 'runtime', doc);
    for (const [key, value] of Object.entries(save.runtime)) runtime.set(key, doc.createNode(value));
  }
  if (save.circuitBreakerEnabled !== undefined) ensureMapping(root, 'circuit_breaker', doc).set('enabled', doc.createNode(save.circuitBreakerEnabled));
  if (save.compressorThresholdPercentage !== undefined) ensureMapping(root, 'compressor', doc).set('threshold_percentage', doc.createNode(save.compressorThresholdPercentage));
  if (save.delegationStrategy !== undefined) ensureMapping(root, 'rotaris', doc).set('delegation_strategy', doc.createNode(save.delegationStrategy));
  if (save.display && Object.keys(save.display).length > 0) {
    // REQ-CONFIG-256: written per field, so a display key this screen does not offer stays as the file states it.
    const display = ensureMapping(root, 'display', doc);
    for (const [key, value] of Object.entries(save.display)) display.set(key, doc.createNode(value));
  }
  // REQ-CONFIG-256/258 (ADR-0063): the three `skills` keys, per field and per skill name. A null value
  // DELETES that skill's entry, which is REQ-CONFIG-258's sparse rule reaching the document; a map left
  // empty by the deletions is removed with it, so a workspace that states no policy carries no `skills:`.
  if (save.skills && Object.keys(save.skills).length > 0) {
    const skills = ensureMapping(root, 'skills', doc);
    if (save.skills.enabled !== undefined) skills.set('enabled', doc.createNode(save.skills.enabled));
    const writeMap = (key: 'overrides' | 'invocation_overrides', entries: Readonly<Record<string, string | null>> | undefined): void => {
      if (!entries || Object.keys(entries).length === 0) return;
      const map = ensureMapping(skills, key, doc);
      for (const [name, mode] of Object.entries(entries)) {
        if (mode === null) map.delete(name);
        else map.set(name, doc.createNode(mode));
      }
      if (map.items.length === 0) skills.delete(key);
    };
    writeMap('overrides', save.skills.overrides);
    writeMap('invocation_overrides', save.skills.invocationOverrides);
    if (skills.items.length === 0) root.delete('skills');
  }
  // PD-WORKSPACE-002: the `instructions.overrides` map, per file identity. A null value DELETES that
  // file's entry, which is the sparse rule reaching the document; a map left empty by the deletions is
  // removed with it, so a workspace that states no policy carries no `instructions:`.
  if (save.instructions && Object.keys(save.instructions).length > 0) {
    const instructions = ensureMapping(root, 'instructions', doc);
    const entries = save.instructions.overrides;
    if (entries && Object.keys(entries).length > 0) {
      const map = ensureMapping(instructions, 'overrides', doc);
      for (const [id, state] of Object.entries(entries)) {
        if (state === null) map.delete(id);
        else map.set(id, doc.createNode(state));
      }
      if (map.items.length === 0) instructions.delete('overrides');
    }
    if (instructions.items.length === 0) root.delete('instructions');
  }
  // OQ-457: one key each; a section left empty by the removals is removed with them.
  if (save.dictation && Object.keys(save.dictation).length > 0) {
    const dictation = ensureMapping(root, 'dictation', doc);
    for (const [key, value] of Object.entries(save.dictation)) {
      if (value === null || value === undefined) dictation.delete(key);
      else dictation.set(key, doc.createNode(value));
    }
    if (dictation.items.length === 0) root.delete('dictation');
  }
  for (const [role, edit] of workspaceEdits) applyRoleEdit(doc, root, role, edit);
  if (global) for (const [role, edit] of globalEdits) applyRoleEdit(global.doc, rootOf(global.doc), role, edit);

  const wrote = await commit(files.workspace, doc, deps.timers);
  if (!wrote.ok) return wrote;
  let wroteGlobal: WriteOutcome | null = null;
  if (global) {
    const g = await commit(files.global, global.doc, deps.timers);
    if (!g.ok) return g;
    wroteGlobal = g.value;
  }
  return ok({ workspace: wrote.value, global: wroteGlobal });
}

export interface ModelPreferences {
  readonly slots?: Partial<Record<string, string | null>>;
  readonly thinking?: Partial<Record<string, ReasoningLevel | null>>;
  readonly roles?: Readonly<Record<string, { readonly model?: string | null; readonly thinking?: RoleReasoning | null; readonly unsetModel?: boolean; readonly unsetThinking?: boolean }>>;
}

/**
 * The startup model-preference path (REQ-CONFIG-248..252): bootstraps a missing file at either scope with
 * the same starter, touches only the slot keys, their companions and the role mapping, and rejects an
 * unknown slot name naming it (REQ-CONFIG-249). A slot set to null is written as null; a companion set to
 * null removes the key (REQ-CONFIG-250).
 */
export async function writeModelPreferences(file: string, prefs: ModelPreferences, deps: WriterDeps = {}): Promise<Result<WriteOutcome, WriteRefusal>> {
  for (const name of [...Object.keys(prefs.slots ?? {}), ...Object.keys(prefs.thinking ?? {})]) {
    if (!(MODEL_SLOTS as readonly string[]).includes(name)) return err({ code: 'invalid', file, fault: `unknown model slot '${name}'; accepted: ${MODEL_SLOTS.join(', ')}` });
  }
  const booted = bootstrapConfigFile(file);
  if (!booted.ok) return booted;
  if (booted.value === 'declined-directory' || booted.value === 'declined-not-utf8') return err({ code: 'unreadable', file, fault: booted.value === 'declined-directory' ? 'the path is a directory' : 'the file is not UTF-8 text' });
  const opened = openDocument(file);
  if (!opened.ok) return opened;
  const doc = opened.value.doc;
  const root = rootOf(doc);
  for (const [slot, value] of Object.entries(prefs.slots ?? {})) if (value !== undefined) root.set(slot, doc.createNode(value));
  for (const [slot, level] of Object.entries(prefs.thinking ?? {})) {
    const key = thinkingKeyOf(slot as ModelSlot);
    if (level === null) root.delete(key);
    else if (level !== undefined) root.set(key, doc.createNode(level));
  }
  for (const [role, edit] of Object.entries(prefs.roles ?? {})) applyRoleEdit(doc, root, role, edit);
  return commit(file, doc, deps.timers);
}
