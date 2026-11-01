## A Runtime timeout field's description states an unsaved value as stored

The Per-agent timeout (`#child-timeout`) and the Improvement analysis timeout (`#improvement-timeout`) carry an
`aria-description` of "Stored as <N> seconds." (`packages/ui/src/settings/ConfigSettings.tsx`, the `description` passed to
`ClampedNumberField` at the two fields, about lines 320 and 335). `<N>` is read from `pending.runtime` — the form's pending
value — not from the saved one. So during an unsaved edit the description states a figure the workspace file does not hold: a
stored `child_timeout: 3` overtyped with `1` minute reads "Stored as 60 seconds." to a screen reader until Save, while the file
still says 3. The visible stored-value line beneath (`storedTimeoutNote`, `storedSecondsLine` in
`packages/ui/src/settings/config-state.ts`) reads the same pending value, but is hidden whenever the pending value is one the
field can show, which every typed value is. Read from the code on 2026-10-14 by fin45 (`fin45-retro-and-record`) while
recording [OQ-301](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-301)'s ruling; not seen in the built app. Recorded, not repaired: its
repair follows the ordinary path and is outside that ruling.

## Specs

`PD-CONFIG-003` (and its revision 2 for the improvement analysis timeout): the line beneath a value the control cannot express
"states the stored seconds", and REQ-CONFIG-446 states the stored value. A pending edit is not stored until Save
(REQ-CONFIG-419).

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — the `description` of `#child-timeout` (about line 320) and
  `#improvement-timeout` (about line 335), built from `rt = pending.runtime`; `ClampedNumberField`'s `aria-description`.
- `packages/ui/src/settings/config-state.ts` — `storedSecondsLine`, `storedTimeoutNote`, `storedImprovementTimeoutNote`: the
  visible line's wording, read from the same value.

## Outcome — repaired 2026-10-15 (fin46, acceptance finding A3, bundle `fin46-accept1-22`)

Confirmed on the branch before the change, in both forms. **Unit:** a render of the Runtime category over a snapshot storing
`child_timeout: 3` with the form holding the edit `60` described the field as "Stored as 60 seconds."; the same for
`improvement_collector_timeout: 5` overtyped with `300` ("Stored as 300 seconds."). **Built app:** `continuation-proof`'s
`later-run` scenario, which types `1` minute over a stored 3 s in Settings › Runtime › Per-agent timeout and saves, now reads the
field's `aria-description` between the edit and Save and again after Save. On the renderer without the change it read
`["Stored as 60 seconds.","Stored as 60 seconds."]` and the scenario failed; with it, `["Stored as 3 seconds.","Stored as 60
seconds."]` and the scenario passed (2026-10-15, load 1.5 to 2.4 on 4 CPUs).

**The repair.** What either timeout field states as stored is the saved configuration's value (`snapshot.runtime`, the value the
files hold), never the form's pending one, which reaches the file only on Save (REQ-CONFIG-419). `RuntimeSettings`
(`packages/ui/src/settings/ConfigSettings.tsx`) builds both descriptions with the new `storedSecondsDescription(stored)`, and
passes the stored and the pending value to `storedTimeoutNote` and `storedImprovementTimeoutNote`
(`packages/ui/src/settings/config-state.ts`). The visible line beneath now reads the stored value and is hidden once the field
holds an edit, which is when PD-CONFIG-003 says the stored value stops being kept. That line already behaved so in practice:
every value the field commits is one it can show, so the line was hidden during any edit. Reading the stored value makes that
behaviour hold by construction, not by coincidence. The description's wording ("Stored as <N> seconds.") and the line's are
unchanged.

**Pinned by:** `packages/ui/src/settings/child-timeout.test.ts` and `improvement-timeout.test.ts` ("states the stored seconds,
not an unsaved edit, during an edit"), both red before the change; `apps/desktop/scripts/lib/settings-runtime-field.test.ts`
(the two description readings the proof helper takes and parses); and `continuation-proof`'s `later-run` assertion on the
two readings. The improvement analysis timeout's description is pinned by the unit case only: `retrospective-proof` and the
live `ask` scenario now record the same two readings (`fieldSaveReading`) but do not assert them.
