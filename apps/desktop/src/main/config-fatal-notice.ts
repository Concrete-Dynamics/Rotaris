import type { ConfigSnapshot, NoticeAction } from '@rotaris/contracts';

/**
 * OQ-279, ruled 2026-10-13 by the consortium under the owner's delegation (R-072): in REQ-CONFIG-478, as in REQ-CONFIG-233,
 * -239 and -245 and REQ-GIT-071, "a workspace opens" means its configuration loads. Under a fatal load failure in either
 * scope the window, the session history, the repository view and Settings stay available, and every run and isolated start
 * is refused with the report, as built (REQ-EVENTS-021, REQ-GIT-071). What the ruling adds is WHEN the user first learns of
 * it: the report is raised as a persistent `error` notice (REQ-NOTIFY-001) when the workspace opens, naming the file, its
 * scope and the rejected key (REQ-CONFIG-237's line, the snapshot's `fatal`), with the step that recovers — correct it in
 * the named file, then open the workspace again or start a run. Until 2026-10-14 the first the user heard of it was the
 * refusal of the first prompt.
 *
 * The notice is cleared (compare-and-clear, REQ-NOTIFY-026) once a later load of that workspace succeeds — a reloaded
 * snapshot announced with `loadOk: true`, or a run that starts, which it can only do on a configuration that loaded. A fault
 * that comes back after such a clean load raises the notice again: the key carries the workspace's load generation, which
 * each clean load after a raised notice advances, so REQ-NOTIFY-224's once-per-key does not swallow the recurrence.
 */
export const CONFIG_FATAL_TITLE = 'The workspace configuration did not load';
export const CONFIG_FATAL_MESSAGE = 'Correct the rejected key or value in the named file, then open the workspace again or start a run; each loads it again.';

export interface ConfigFatalDeps {
  /** The notice store's `report` (ADR-0049): the keyed, persistent publication. */
  readonly report: (input: {
    readonly severity: 'error';
    readonly title: string;
    readonly message: string;
    readonly detail: string;
    readonly persistent: true;
    readonly key: string;
    readonly action?: { readonly label: string; readonly action: NoticeAction } | undefined;
  }) => Promise<{ readonly id: number; readonly shown: boolean }>;
  /** The notice store's compare-and-clear (REQ-NOTIFY-026). */
  readonly dismiss: (noticeId: number) => Promise<void>;
  /** The action the notice carries: `recoveryFor('config.fatal')`, to the Settings category drawing the Fatal card. */
  readonly action: { readonly label: string; readonly action: NoticeAction } | undefined;
  readonly log: (line: string) => void;
}

interface Entry {
  generation: number;
  raised: { readonly id: number; readonly report: string } | null;
}

export class ConfigFatalNotices {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly deps: ConfigFatalDeps) {}

  /** The key a workspace's fatal report is published under — its root, its load generation and the report itself. */
  static keyOf(root: string, generation: number, report: string): string {
    return `config.fatal:${root}:${generation}:${report}`;
  }

  /** One load of `root`'s configuration, as a snapshot reports it. */
  async observe(root: string, snapshot: Pick<ConfigSnapshot, 'loadOk' | 'fatal'>): Promise<void> {
    if (snapshot.loadOk) { await this.loaded(root); return; }
    const report = snapshot.fatal ?? 'The configuration could not be loaded.';
    const entry = this.#entry(root);
    if (entry.raised?.report === report) return;
    const r = await this.deps.report({
      severity: 'error', title: CONFIG_FATAL_TITLE, message: CONFIG_FATAL_MESSAGE, detail: report, persistent: true,
      key: ConfigFatalNotices.keyOf(root, entry.generation, report),
      ...(this.deps.action === undefined ? {} : { action: this.deps.action }),
    });
    if (!r.shown) return;
    entry.raised = { id: r.id, report };
    this.deps.log(`notice: ${CONFIG_FATAL_TITLE} for ${root} (#${r.id}) — ${report}`);
  }

  /** A load of `root` that succeeded (a clean snapshot, or a run that started): the standing notice, if any, is cleared. */
  async loaded(root: string): Promise<void> {
    const entry = this.#entries.get(root);
    if (!entry?.raised) return;
    const id = entry.raised.id;
    entry.raised = null;
    entry.generation += 1;
    await this.deps.dismiss(id);
    this.deps.log(`notice: the configuration of ${root} loaded again; the fatal-load notice #${id} is cleared`);
  }

  #entry(root: string): Entry {
    let entry = this.#entries.get(root);
    if (!entry) { entry = { generation: 0, raised: null }; this.#entries.set(root, entry); }
    return entry;
  }
}
