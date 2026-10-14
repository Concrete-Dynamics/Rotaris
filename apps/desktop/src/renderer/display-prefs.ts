import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';

/**
 * REQ-CHAT-167 (`display/showReasoning`) and REQ-CHAT-067 (`display/autoCollapseTools` and `display/groupToolCalls`), with
 * REQ-CONFIG-403 and PD-CONFIG-004: the window's three display preferences, as one store with its three writers — the boot
 * read, main's announcement (channel 14) and this window's own write. A factory over the bridge so a test can script the
 * bridge's answers; `shell.ts` makes the window's one instance.
 *
 * The boot read applies only the fields no announcement or write has set since it began: its three `prefs.get` replies are
 * applied together after all three have answered, and a change that landed at main between them reached this window first,
 * so applying the stale answer over it would keep the value the person just changed away from
 * (`docs/defects/fixed/a-windows-boot-read-of-the-display-preferences-can-overwrite-a-newer-announcement.md`).
 */
export type DisplayPrefKey = 'display/autoCollapseTools' | 'display/groupToolCalls' | 'display/showReasoning';
export interface DisplayPrefsState { readonly showReasoning: boolean; readonly autoCollapseTools: boolean; readonly groupTools: boolean }
type Field = keyof DisplayPrefsState;

const DISPLAY_FIELD: Record<DisplayPrefKey, Field> = {
  'display/autoCollapseTools': 'autoCollapseTools',
  'display/groupToolCalls': 'groupTools',
  'display/showReasoning': 'showReasoning',
};

export interface DisplayPrefs {
  readonly store: StoreApi<DisplayPrefsState>;
  /** The boot read: every field no announcement or write has set while it was under way. */
  readonly read: () => Promise<void>;
  /** An announcement from main (channel 14), already parsed to the fields it sets. */
  readonly fold: (patch: Partial<DisplayPrefsState>) => void;
  /** This window's own change, set in the store once main has stored it. */
  readonly write: (key: DisplayPrefKey, value: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function createDisplayPrefs(bridge: { readonly command: (req: CommandRequest) => Promise<CommandOutcome> }): DisplayPrefs {
  /** The first two default off, `groupTools` on (REQ-CHAT-067), so an unset preference reads as on. */
  const store = createStore<DisplayPrefsState>(() => ({ showReasoning: false, autoCollapseTools: false, groupTools: true }));
  /** One set per boot read under way: the fields set since it began, which it then leaves alone. */
  const reads = new Set<Set<Field>>();
  const fold = (patch: Partial<DisplayPrefsState>): void => {
    for (const touched of reads) for (const field of Object.keys(patch) as Field[]) touched.add(field);
    store.setState(patch);
  };
  const read = async (): Promise<void> => {
    const touched = new Set<Field>();
    reads.add(touched);
    try {
      const [reasoning, collapse, group] = await Promise.all([
        bridge.command({ kind: 'prefs.get', key: 'display/showReasoning' }),
        bridge.command({ kind: 'prefs.get', key: 'display/autoCollapseTools' }),
        bridge.command({ kind: 'prefs.get', key: 'display/groupToolCalls' }),
      ]);
      const booted: DisplayPrefsState = {
        showReasoning: reasoning.ok && (reasoning.value as { value?: boolean }).value === true,
        autoCollapseTools: collapse.ok && (collapse.value as { value?: boolean }).value === true,
        groupTools: group.ok ? (group.value as { value?: boolean }).value !== false : true,
      };
      store.setState(Object.fromEntries((Object.keys(booted) as Field[]).filter((f) => !touched.has(f)).map((f) => [f, booted[f]])) as Partial<DisplayPrefsState>);
    } finally {
      reads.delete(touched);
    }
  };
  const write = async (key: DisplayPrefKey, value: boolean): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const r = await bridge.command({ kind: 'prefs.set', key, value });
    if (!r.ok) return { ok: false, reason: r.detail ?? r.headline };
    fold({ [DISPLAY_FIELD[key]]: value });
    return { ok: true };
  };
  return { store, read, fold, write };
}
