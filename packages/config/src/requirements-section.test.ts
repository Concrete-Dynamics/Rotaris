import { describe, expect, it } from 'vitest';
import { readRequirementsSection, REQUIREMENTS_DEFAULTS, renderNamespaceExample, validateRequirementsPatch, worktreeStorageCollision } from './sections/requirements.js';
import type { ProblemSink } from './sections/field.js';

/**
 * Part AP — the `requirements:` block registered for the first time (REQ-CONFIG-183, 190..198; REQ-GIT-074/138/139).
 */
const read = (value: unknown) => { const sink: ProblemSink = { errors: [], warnings: [] }; const section = readRequirementsSection(value, sink); return { section, sink }; };

describe('REQ-CONFIG-196/198/193..195: the defaults and the typed reads', () => {
  it('an absent block yields the schema defaults: manual, 2, the seven escalations, the default templates', () => {
    const { section, sink } = read(undefined);
    expect(sink.errors).toEqual([]);
    expect(section).toEqual(REQUIREMENTS_DEFAULTS);
    expect(section.scheduling.mode).toBe('manual');
    expect(section.scheduling.max_concurrent_units).toBe(2);
    expect(section.execution.branch_template).toBe('rotaris/req/{requirement_id}/{unit_id}');
    expect(section.human_in_the_loop.escalate).toHaveLength(7);
  });
  it('reads the stated keys with their types and bounds', () => {
    const { section, sink } = read({ scheduling: { mode: 'automatic', max_concurrent_units: 3 }, change: { analyze_changes: false }, human_in_the_loop: { confirm_source_writes: true, answer_timeout_minutes: 15 }, execution: { branch_template: 'rotaris/req/{req}/{unit}-{slug}', retry_limit: 0, decomposition: { max_units: 2 } } });
    expect(sink.errors).toEqual([]);
    expect(section.scheduling).toMatchObject({ mode: 'automatic', max_concurrent_units: 3, max_concurrent_requirements: 2 });
    expect(section.change.analyze_changes).toBe(false);
    expect(section.human_in_the_loop).toMatchObject({ confirm_source_writes: true, answer_timeout_minutes: 15 });
    expect(section.execution).toMatchObject({ branch_template: 'rotaris/req/{req}/{unit}-{slug}', retry_limit: 0, decomposition: { enabled: true, max_units: 2 } });
  });
  it('REQ-CONFIG-196: a concurrency below 1, a mode outside the two, a negative retry limit are errors and keep the default', () => {
    const { section, sink } = read({ scheduling: { mode: 'sometimes', max_concurrent_units: 0 }, execution: { retry_limit: -1 } });
    expect(sink.errors.map((e) => e.path).sort()).toEqual(['requirements.execution.retry_limit', 'requirements.scheduling.max_concurrent_units', 'requirements.scheduling.mode']);
    expect(section.scheduling.mode).toBe('manual');
    expect(section.scheduling.max_concurrent_units).toBe(2);
  });
});

describe('REQ-CONFIG-183: unknown keys are fatal everywhere under requirements:, except the one named as not-a-key', () => {
  it('an unknown top-level key and an unknown nested key are each an error', () => {
    const { sink } = read({ store_subpath: 'x', scheduling: { max_parallel: 3 } });
    expect(sink.errors.map((e) => e.path).sort()).toEqual(['requirements.scheduling.max_parallel', 'requirements.store_subpath']);
  });
  it('REQ-CONFIG-194 / REQ-GIT-074: execution.worktree_subpath is reported and ignored, never rejected', () => {
    const { section, sink } = read({ execution: { worktree_subpath: 'elsewhere' } });
    expect(sink.errors).toEqual([]);
    expect(sink.warnings.map((w) => w.path)).toEqual(['requirements.execution.worktree_subpath']);
    expect(section.execution.branch_template).toBe(REQUIREMENTS_DEFAULTS.execution.branch_template);
  });
  it('REQ-CONFIG-192/183: the withdrawn delivery.store_subpath is reported once and ignored, never rejected, and the rest of the block loads', () => {
    const { section, sink } = read({ delivery: { store_subpath: 'records', history_limit: 100 }, scheduling: { mode: 'automatic' } });
    expect(sink.errors).toEqual([]);
    expect(sink.warnings.map((w) => w.path)).toEqual(['requirements.delivery.store_subpath']);
    const message = sink.warnings[0]!.message;
    expect(message).toMatch(/withdrawn/);
    expect(message).toMatch(/not mistyped/);
    expect(message).toMatch(/delivery records are no longer files in the workspace/);
    expect(message).toMatch(/no configuration key names a location for them/);
    expect(message).toMatch(/ignored/);
    expect(message).toMatch(/rest of the configuration loaded/);
    expect(section.opaque.delivery).toEqual({ history_limit: 100 });
    expect(section.scheduling.mode).toBe('automatic');
    expect(read({ delivery: { store_subpath: 'records' } }).section.opaque.delivery).toEqual({});
  });
  it('REQ-CONFIG-190/192/197: evidence, delivery and board are accepted as mappings and carried opaque', () => {
    const { section, sink } = read({ evidence: { follow_source_flags: false }, delivery: { history_limit: 100 }, board: { default_sort: 'id' } });
    expect(sink.errors).toEqual([]);
    expect(section.opaque).toEqual({ evidence: { follow_source_flags: false }, delivery: { history_limit: 100 }, board: { default_sort: 'id' } });
    expect(read({ board: 'yes' }).sink.errors.map((e) => e.path)).toEqual(['requirements.board']);
  });
  it('validates on assignment: the same reader over a one-key patch', () => {
    expect(validateRequirementsPatch({ scheduling: { mode: 'automatic' } })).toEqual([]);
    expect(validateRequirementsPatch({ scheduling: { max_concurrent_units: 65 } })).toEqual([]);
    expect(validateRequirementsPatch({ scheduling: { max_concurrent_units: 'two' } }).map((p) => p.path)).toEqual(['requirements.scheduling.max_concurrent_units']);
  });
});

describe('REQ-GIT-138/139: the branch template is checked at load', () => {
  it('a template missing the requirement or the unit placeholder is rejected', () => {
    expect(read({ execution: { branch_template: 'rotaris/req/{req}' } }).sink.errors.map((e) => e.path)).toEqual(['requirements.execution.branch_template']);
    expect(read({ execution: { branch_template: 'rotaris/req/{requirement_id}/{unit}' } }).sink.errors).toEqual([]);
  });
  it('a template rendering into rotaris/session/ or rotaris/integration/ is rejected on the rendered example, not the literal prefix', () => {
    expect(renderNamespaceExample('rotaris/{req}/{unit}')).toBe('rotaris/sample-req/sample-unit');
    expect(renderNamespaceExample('{slug}/{req}/{unit}')).toBe('sample-slug/sample-req/sample-unit');
    const literal = read({ execution: { branch_template: 'rotaris/session/{req}/{unit}' } });
    expect(literal.sink.errors.map((e) => e.path)).toEqual(['requirements.execution.branch_template']);
    expect(literal.sink.errors[0]!.message).toMatch(/rotaris\/session\/ namespace/);
    // Reached only after substitution: a placeholder whose sample renders into the forbidden prefix is impossible by the
    // slug (no `/` survives), so a template must spell the prefix itself — the check still runs on the example.
    const integration = read({ execution: { integration_branch_template: 'rotaris/integration/{req}/{id}' } });
    expect(integration.sink.errors.map((e) => e.path)).toEqual(['requirements.execution.integration_branch_template']);
  });
});

describe('REQ-GIT-138: the session checkout directory stays out of the requirement checkout directory', () => {
  it('rejects the fixed directory and anything inside it, read as the worktree placement reads it', () => {
    for (const bad of ['requirements/worktrees', ' requirements/worktrees ', 'requirements\\worktrees\\x', './requirements/./worktrees', 'a/../requirements/worktrees/b']) expect(worktreeStorageCollision(bad, 'linux'), bad).toMatch(/requirement checkout directory .rotaris\/requirements\/worktrees.*REQ-GIT-138/);
    for (const good of ['worktrees', '', '  ', '.', 'requirements', 'requirements/worktrees2', 'x/requirements/worktrees', '../requirements/worktrees']) expect(worktreeStorageCollision(good, 'linux'), good).toBeNull();
  });
  // `docs/defects/fixed/an-absolute-worktree-storage-subpath-is-reported-as-resolving-inside-rotaris.md`: an absolute value
  // leaves `.rotaris`, which REQ-GIT-005 refuses where the worktree is placed; the load does not report it as inside.
  it('leaves an absolute value to REQ-GIT-005, as it leaves one that climbs out of .rotaris', () => {
    for (const abs of ['/requirements/worktrees', '\\requirements\\worktrees', 'C:/requirements/worktrees', 'c:\\requirements\\worktrees\\x']) {
      expect(worktreeStorageCollision(abs, 'linux'), abs).toBeNull();
      expect(worktreeStorageCollision(abs, 'win32'), abs).toBeNull();
    }
  });
  it('folds case where the file system does: Windows only', () => {
    expect(worktreeStorageCollision('Requirements/Worktrees', 'win32')).not.toBeNull();
    expect(worktreeStorageCollision('Requirements/Worktrees', 'linux')).toBeNull();
  });
});
