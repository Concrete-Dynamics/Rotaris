## Code comments call built mechanisms unbuilt or owed

A dozen code comments still describe a mechanism as unbuilt, owed or "until Part X merges" after the mechanism was built.
They mislead the next reader, and an agent that trusts a comment over the code may "build" a thing twice or skip a check
that is now possible. Verified on `main` at `6de2a67` (2026-10-13) and again on `1351ed1`:

- `packages/config/src/sections/compressor.ts:6`: "Compression itself is not built". ADR-0060 is built
  (`packages/engine/src/run/compression.ts`; `turn.ts` and `ladder.ts` drive it).
- `packages/ui/src/settings/About.tsx:16-21`: "no build asset carries one yet", the notices bundle "is not produced by
  `pnpm package`", "owed to the packaging part". `apps/desktop/scripts/package.mjs` runs `pnpm notices` and
  `pnpm build-id`, `apps/desktop/electron-builder.yml` carries both in `extraResources`, and
  `apps/desktop/src/main/about.ts` states the 2026-09-27 behaviour.
- `packages/mcp/src/index.ts:2`: "ADR-0035 owed". Built 2026-09-06 (Part T; `docs/architecture/codebase.md`).
- `packages/contracts/src/config.ts:88`: the Display category "is not built". `packages/ui/src/settings/DisplaySettings.tsx`
  is that category (Part AG).
- `packages/ui/src/settings/ConfigSettings.tsx:260`: "The security policy card is not built: no confinement backend
  exists". `SecurityPolicy.tsx` (Part AR) is rendered by the same function.
- `packages/engine/src/sessions.ts:350` and `packages/engine/src/run/run.ts:3357`: workspace context listed as not built.
  `apps/desktop/src/run-host/skills.ts` builds and injects it; only persona memory is still missing.
- `packages/engine/src/run/run.ts:3242`: "the session log is not built". `packages/engine/src/session-log.ts` implements
  REQ-SESSION-142.
- `packages/engine/src/sessions.ts:3207`: the improvement library "does not exist in this build". The v18 store, the
  analyst and the lifecycle were built 2026-09-14/15 (`packages/store/src/improvements/`); `completeDelete` leaves it
  untouched on purpose.
- `packages/engine/src/run/crash.ts:265`: "a continue's own run is not built yet". `continueSession` and the Continue
  action exist (PD-ORCH-005); the ring settle is safe for another reason, which the comment did not state.
- `packages/ui/src/transcript/TranscriptPane.tsx:84-87`: "no Clear action exists anywhere in the product". The toolbar's
  "Clear transcript" (`packages/ui/src/slash/controls.tsx`, Part AO) is disabled on an empty transcript, so REQ-CHAT-073 is
  met whole. ADR-0046's first-execution note carries the same falsified limb.
- `packages/ui/src/slash/catalogue.ts:146-149` and `packages/ui/src/WorkspaceView.tsx:211`: `forceCompression` and
  `clearTranscript` "have no arm in the run host until Part AO". Both are armed (`packages/engine/src/sessions.ts`).
- `packages/ui/src/commands/registry.ts:9,152`: the slash catalogue "not built", `slashName` "not consumed yet".
  `packages/ui/src/slash/catalogue.ts` consumes it.
- `packages/ui/src/commands/useCommandShortcuts.ts:18` and `packages/ui/src/shell-state.ts:71`: "the slash popup and the
  search panel are not built", "an unregistered slot is a surface that is not built". The slash popup is built and
  registers; the search panel is built and registers nothing, which is a separate defect
  ([`window-level-escape-skips-the-open-transcript-search-panel.md`](window-level-escape-skips-the-open-transcript-search-panel.md)).
- `apps/desktop/src/renderer/main.tsx:1039-1040`: "no project-initialization surface". The ADR-0064 surface exists
  (`packages/ui/src/settings/ProjectSettings.tsx`, `project-init.ts`); the hosted-cloud and proposal-store halves still hold.
  Nothing raises `open-project-init` either.
- `apps/desktop/src/workspace-service/delivery.ts:25,59-61`: `ENGINE_NOT_MERGED` "until Part AJ merges". Part AJ merged
  2026-09-09 (`workspace-service/index.ts`); the stand-in's only users are in `delivery.test.ts`.

Adjacent, in the record: ADR-0035's header still reads "Blocked by an open question (OQ-23)", resolved 2026-09-06 (its own
first-execution section says so).

## Specs

None contradicted. The comments are wrong about the code, not the code about the specification. REQ-CHAT-073 is the one
requirement whose recorded state changes: from "met in one clause of two" to met.

## Relevant files

- The files listed above, at the lines named.
- `docs/architecture/adr/0046-the-transcript-apply-pipeline.md` — the "REQ-CHAT-073 is met in one clause of two" limb.
- `docs/architecture/adr/0035-the-bundled-code-intelligence-runtime.md` — the header's "Blocked by" line.

## Outcome — repaired 2026-10-13 (fin41, `fin41-comments-and-evidence`)

Every comment listed above now describes the code as it stands, and each keeps its falsified reading beside the
replacement ("Until 2026-10-13 this said …"). No code changed, so no test can fail without the repair and none was
added: the evidence is the comments themselves, against the files each now names. `pnpm typecheck` and `pnpm lint` are green
over the change. The record's own copies were corrected in place in the same commit: ADR-0046's REQ-CHAT-073 limb (struck,
met whole), and ADR-0035's "Blocked by OQ-23" header line (struck, resolved 2026-09-06).

Two adjacent questions were checked, not reworded:

- **ADR-0035's "Status: proposed".** Not stale in a way peculiar to ADR-0035. Every ADR written before the Architecture
  Gate still reads "proposed" (53 of them), and the gate record (`docs/clean-room/architecture-gate.md`) is where their
  approval is recorded; the ADRs accepted one by one after the gate (ADR-0022, ADR-0059 to ADR-0065) say "accepted". The
  header was left as it is: changing one of 53 would make the other 52 read as less approved. Only the "Blocked by" line,
  which was false, was corrected.
- **The dead `open-project-init` action.** Nothing raises it, so routing the arm would add a path no notice reaches. Which
  notice should offer it, and what it opens for a workspace another window holds, is raised as
  [OQ-262](../../architecture/open-questions.md#oq-262). The renderer's comment now says the surface exists and nothing
  raises the action.

Noticed while doing this and recorded, not repaired:
[`window-level-escape-skips-the-open-transcript-search-panel.md`](window-level-escape-skips-the-open-transcript-search-panel.md).
