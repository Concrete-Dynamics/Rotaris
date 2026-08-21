# Plan 05 — Relocate `RequirementEditing`; creation preview as adapter capability

**Status:** Implemented (see § 9) · **Date:** 2026-08-17, revised 2026-08-18 · **Source:** review finding F5 (Medium), § 6.5
**Size:** M · **Risk:** Low (wave 1 is mechanical; wave 2 is additive behind a seam)
**Depends on:** nothing. **Land before** SWR-3122 / SWR-3118 implementation
multiplies source kinds.
**Touches:** `apps/rotaris/src/rotaris/widgets/requirement_editor.py`,
new `apps/rotaris/src/rotaris/services/requirement_editing.py`,
`apps/rotaris/src/rotaris/services/requirements_actions.py`,
`apps/rotaris/src/rotaris/services/requirements_controller.py`,
`src/rotaris_core/requirements/sources/base.py`, the built-in store adapter,
tests

---

## 1. Problem

The text-write seam lives under `widgets/`, and the services layer imports
*up* into it:

- `RequirementEditing` — the editor's "one door" over the engine's
  `RequirementWriteBack` — is defined in
  `widgets/requirement_editor.py:460–559`, beside the Qt panels, together with
  the whole service-shaped half of the module: `SourceOption` /
  `creation_sources` (`:139–178`), `_location_of` (`:181–189`),
  `CreationTarget` / `preview_target` (`:195–272`), `EditInput` /
  `NewRequirement` (`:278–374`), `EditOutcome` / `CreationOutcome`
  (`:380–454`), and the message constants (`:115–133`).
- `services/requirements_actions.workspace_editing()` imports the class from
  widgets (`requirements_actions.py:1973`) — a services→widgets dependency
  pointing the wrong way.
- `preview_target` hard-codes the built-in Markdown store's layout: it probes
  `getattr(source, "store_path")` and then applies `MarkdownStoreLayout` /
  `allocate_requirement_id` / `requirement_filename` itself (`:241–272`).
  Every other source kind (declarative, generated, tracker) answers "location
  not known" — an honest fallback, but the knowledge of *where a creation
  lands* is an **adapter** concern, and SWR-3606's "the adapter creates the
  native artefact" is one probe away from quietly becoming "the widget knows
  the built-in store's conventions".

None of this is broken today. It becomes debt the moment SWR-3122 (sectioned
documents) and SWR-3118 (source-reported state) add source kinds and the
editor sprouts a second and third `store_path`-shaped probe.

## 2. Goal / non-goals

**Goal.** (1) The service half moves to `services/requirement_editing.py`;
widgets keep only widgets; the import direction is services ← widgets.
(2) Creation preview becomes an optional adapter capability with the exact
shape the history seam already has (`history_of`, `sources/base.py:454–466`),
and the built-in store implements it where `store_path` lives today.

**Non-goals.** Any behaviour change: previews, refusal sentences, outcomes and
notices stay byte-identical. New capability *enum* members (SWR-3105's
`SourceCapability` stays `READ/CREATE/UPDATE/DELETE` — preview is not an
operation on the store, it is a description of one, so the optional-protocol
pattern fits and the enum does not grow). Editing the creation *flow* itself.

## 3. Design

### 3.1 Wave 1 — the mechanical move

New `services/requirement_editing.py` receives, verbatim (docstrings, traces
and all): `RequirementEditing`, `SourceOption`, `creation_sources`,
`_location_of`, `CreationTarget`, `preview_target`, `EditInput`,
`NewRequirement`, `EditOutcome`, `CreationOutcome`, and the constants
`ORIGIN_REQUIRED`, `TITLE_REQUIRED`, `TARGET_UNSTATED`, `NOTHING_TO_SAVE`,
`VERSION_FACT`. `widgets/requirement_editor.py` keeps `RequirementEditorPanel`,
`RequirementCreationForm`, `EDITOR_AREA` / `CREATION_AREA`, and imports what
its panels render from the new services module.

Import fixes: `workspace_editing` (`requirements_actions.py:1973`) drops its
upward import; the controller's `RequirementEditing` typing
(`requirements_controller.py:270`, `:398–419`) re-points; find the rest with
`rtk grep "widgets.requirement_editor" apps` and re-point tests. **No
compatibility re-exports** — the repo's one-fact-one-home rule applies to
symbols too; fix every importer in the slice.

### 3.2 Wave 2 — preview as an adapter capability

In `sources/base.py`, mirroring the history seam precedent
(`HistoricalRequirementSource` + `history_of`, `:435–466`):

```python
class CreationTarget(BaseModel):        # moves engine-side, frozen
    source_id: str
    req_id: str = ""
    path: str = ""
    index_path: str = ""
    reason: str = ""
    # `known` / `sentence` properties move with it

@runtime_checkable
class CreationPreviewSource(Protocol):
    """The optional fifth ask: where would this draft land, without writing.

    Optional like history, and for the same reason: an adapter that cannot
    name a location before the write says so, and the form shows that rather
    than a plausible path it made up (SWR-3606, SWR-3112).
    """
    def preview_creation(self, draft: RequirementDraft,
                         *, used_ids: Collection[str] | None = None) -> CreationTarget: ...

def preview_of(source: RequirementSource) -> CreationPreviewSource | None:
    """Ask-first check, mirroring history_of: the declaration decides."""
```

- The **built-in store adapter** — exactly the class that exposes
  `store_path` today (locate it at implementation; it is the source
  `requirement_source_for` returns for a ReqToCode workspace,
  `requirements_actions.py:1524–1548`) — implements `preview_creation` by
  moving the body of today's `preview_target` (`MarkdownStoreLayout`,
  `allocate_requirement_id`, `requirement_filename`, the `CreationError`
  handling) into it. The layout knowledge lands where the layout lives.
- The desktop's `preview_target(source, form)` shrinks to a translation shim:
  build the `RequirementDraft` from the form, `preview = preview_of(source)`,
  return `preview.preview_creation(draft)` or the "does not name a file
  location" refusal `CreationTarget` — the identical sentence non-implementing
  sources produce today. The `getattr(source, "store_path")` probe **is
  deleted**.
- `_location_of` (the combo-label probe) may keep its `store_path` probe in
  this plan — it is display-only and harmless. Optional follow-up noted, not
  scheduled: fold a `describe_location()` onto the same protocol if a tracker
  source ever wants a label.

**`CanonicalRequirement` untouched; imports point engine←app only.**
`CreationTarget` moving into `sources/base.py` means the desktop imports it
from the engine — the same direction every other seam value travels.

### 3.3 Alternatives considered

- **New `SourceCapability.PREVIEW_CREATE` enum member.** Rejected: SWR-3105's
  capabilities gate *operations the write path may attempt*; a preview is a
  description, not an operation, and the optional-protocol pattern
  (`history_of`) already models "can this adapter answer a richer question".
  Growing the enum would also touch every capability display surface for no
  user-visible gain.
- **Leave everything in widgets, fix only the import direction.** Rejected:
  the module would still be the place future source-kind knowledge accretes;
  the review's point is to move the seam before SWR-3122/3118 multiply the
  probes.

## 4. Waves

### Wave 1 — move the service half

1. Create `services/requirement_editing.py`; move symbols verbatim; re-point
   every importer (services, controller, widgets, tests); update both
   modules' `__all__` and module docstrings (the widgets docstring loses the
   seam prose, the services module gains it).
2. Gate: full desktop suite green **without editing any test assertion**
   (imports only); `mypy` strict green; `reqtocode check` green (the
   `@traces(SWR_3605/3606/3111/3112/3105)` markers moved with the code — the
   check confirms nothing was dropped).

### Wave 2 — the capability

1. Engine: `CreationTarget` + `CreationPreviewSource` + `preview_of` in
   `sources/base.py`; built-in adapter implements it; engine unit tests
   (preview over a fixture store equals the old `preview_target` output —
   a byte-for-byte parity test over the same fixture, including the epic /
   index paths and the `CreationError` refusal path).
2. Desktop: shrink `preview_target` to the shim; delete the `store_path`
   probe; a fake source implementing the protocol shows a preview in the
   creation form (new test); declarative/generated sources still produce the
   "location not known" sentence (existing tests keep passing).
3. Gate: engine + desktop suites green; parity test proves zero behaviour
   change for the built-in store.

### Wave 3 — spec cross-check

1. Re-read SWR-3606 / SWR-3112 / SWR-3105: no criteria change expected —
   wave 2 makes SWR-3606's "the adapter creates the native artefact" hold for
   the *preview* half too. If SWR-3606's body describes the preview mechanism,
   update the description to name the adapter capability; body edit, no status
   change.
2. Move/extend `@traces` on the new engine symbols
   (`SWR_3606`, `SWR_3112`, `SWR_3105`); `reqtocode check` green.

## 5. Specification & traceability impact

No new ids. Trace markers move in wave 1 and extend engine-side in wave 2.
SWR-3606 body may get a sentence updated (wave 3). Touching nothing in the
epic index avoids the known `diff --strict` shared-hash noise; `check` is the
gate either way.

## 6. Test strategy

The load-bearing test is wave 2's **parity test**: old preview vs new preview
over one fixture store, equal in every field, including refusals. Everything
else is import mechanics covered by the existing suite. The guard sweep
(`test_requirements_board.py:483–680`) covers the moved code exactly as
before — it sweeps all of `apps/rotaris/src`, and the move stays inside it.

## 7. Risks & rollback

- **Hidden importers** (dynamic import, string references) — mitigate with
  `rtk grep "requirement_editor" apps src tests` before declaring wave 1 done.
- **Circular import** services↔widgets if the widgets module keeps a symbol
  the services module needs — the move list in 3.1 is complete precisely to
  avoid this; verify with a cold `import rotaris` in a test.
- Rollback: wave 1 is a pure move (revertible); wave 2's protocol is additive
  — reverting the desktop shim restores the probe without touching the engine.

## 8. Acceptance criteria

- [ ] `rtk grep "from rotaris.widgets" apps/rotaris/src/rotaris/services`
      finds nothing — services never import widgets.
- [ ] `widgets/requirement_editor.py` contains only Qt surface classes.
- [ ] `preview_of` exists beside `history_of` with the same ask-first shape;
      the built-in store implements it; the desktop holds no
      `MarkdownStoreLayout` knowledge and no `store_path` probe in the
      preview path.
- [ ] Preview output for the built-in store is proven unchanged (parity test).
- [ ] Full suites + mypy + `reqtocode check` green after every wave.

---

## 9. What was built, and two things this plan got wrong (2026-08-18)

Both waves landed, plus the § 4 wave-3 spec cross-check. Two claims in the text
above did not survive contact with the code, and one design decision was taken
against § 3.2 deliberately.

### 9.1 Acceptance criterion 1 was unachievable, and always was

> `rtk grep "from rotaris.widgets" apps/rotaris/src/rotaris/services` finds
> nothing — services never import widgets.

`services/requirements_controller.py` is a services module whose job includes
building and attaching Qt panes; it imports `widgets.cards`, `widgets.feedback`,
`widgets.requirement_blockers` and several `views.*` modules, and did so before
this plan existed. The criterion could only have been met by moving the
controller, which is not what F5 is about.

**The criterion that was met instead:** no services module imports the *editing
seam* from widgets. `workspace_editing()` — a pure service factory that reached
up into `widgets/` for a class that writes files — no longer does.

### 9.2 § 6 named the wrong guard

> The guard sweep (`test_requirements_board.py:483–680`) covers the moved code
> exactly as before — it sweeps all of `apps/rotaris/src`.

It does not. `_BOARD_SURFACES` is a fixed five-module list — the board views,
the card and the evidence ring — and `requirement_editor.py` is not in it, so
that sweep was never relevant here.

The guard that *was* relevant is
`test_the_editor_states_no_delivery_state_and_performs_no_transition`, which
read `widgets/requirement_editor.py` **by filename** and swept it for
`DeliveryState`, `TransitionRequest`, `apply_transition`, `DeliveryStore`,
`satisfied_hash` and `BoardAction`. `RequirementEditing` is exactly the class
that claim is about, and exactly the class that moved. Left as written, the
sweep would have kept passing while guarding nothing. It now sweeps both halves;
verified by adding a `DeliveryState` reference to the moved module.

### 9.3 `CreationTarget` stayed desktop-side, against § 3.2

§ 3.2 moves `CreationTarget` into `sources/base.py` and has the protocol return
it. It stayed in the desktop instead. Its `known` and `sentence` are UI copy
("will be written to", "and listed in"), and moving them engine-side would put
presentation in `sources/base.py` and add a second creation-shaped model beside
`RequirementCreation`. `CreationPreviewSource.preview_creation` returns
`RequirementCreation` — the value the engine already has — or raises
`CreationError`; the desktop translates.

### 9.4 The duplication was one layer deeper than § 3.2 saw

§ 3.2 moves `preview_target`'s body into the adapter. That would have relocated
a duplicate rather than removed one: `MarkdownStoreWriter.create()` *already*
resolved the id, the folder, the file name and the epic index, independently of
`preview_target`, and the two agreed only by inspection with one integration
test sampling the happy path.

`MarkdownStoreWriter` therefore gained `plan()` — everything `create()` does
before its first write, returning the value `create()` returns — and `create()`
asks it where to go. Preview and write cannot disagree, structurally.
Mutation-checked: giving `create()` a different filename rule fails the
agreement tests at both levels.

### 9.5 One intended behaviour change

The old preview used `form.title or req_id` for the file name, so an empty title
showed a path like `SWR-4202-swr-4202.md` — a location `validate_draft` would
then refuse. Sharing one computation means preview and create refuse at the same
door, and that state now shows the store's own sentence. SWR-3606's second
criterion asks the user to see where the artefact *will be* written; naming a
file nothing will write did not meet it. Covered by its own test, and SWR-3606's
body and portfolio were updated in the same commit.
