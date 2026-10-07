## The raw-count fallback declares a loop on four reads of different files

When the loop classifier fails or is cut at its bound on a raw-count trigger, `rawFallbackHasEvidence`
(`packages/engine/src/run/supervisor.ts`) counts the last four tool calls as evidence of a loop whenever they share a tool
name, whatever their arguments. With a model that reasons before it answers every classification is cut at the 2.0 s bound,
so this limb decides every raw-count activation. At the final duress live run at `a68f121` (session `e6747bd0`, pack
`2026-10-07T07-09-30-708Z`, the autopsy's finding D6) it fired for the first time live: at `wave2e-decisions`'s 60th call
the classification (request 149) was cut at 1,915 ms, and the fallback found calls #229 to #232, four `read_file` calls in two
steps over `test/extra.test.js` and `docs/decisions.md` — a child checking its own document. Timeline entry 43 (07:33:11.581)
read "Pause and reassess read_file around docs/decisions.md …" with `trigger: raw-count`, and the child spent request 150
(24.5 s, about 5 kB of reasoning) answering "nothing foreign — only my own writes".

Recorded 2026-10-07 before the repair (fin32). The build is faithful to the text ("≥ 4 consecutive same-tool calls"); the
change is the R-072 consortium's ruling of OQ-232, carried by PD-ORCH-016.

## Specs

- REQ-ORCH-104 ("≥ 4 consecutive same-tool calls — never from counts alone") and REQ-NOTIFY-109 ("back-to-back invocations
  of the same tool"): the build follows them; OQ-232's ruling narrows both by PD-ORCH-016.
- REQ-ORCH-101's sameness (tool name and whole arguments), REQ-NOTIFY-102 (no corrective message where no loop occurs).
- `fixed/tool-only-steps-read-as-three-identical-messages.md`, which left this limb "unchanged" and "Not reached live".

## Relevant files

- `packages/engine/src/run/supervisor.ts` — `rawFallbackHasEvidence`, its comparison by `event.name`.
- `packages/engine/src/run/supervisor.test.ts` — the REQ-ORCH-104 cases, one of which pins four greps with different
  arguments as evidence.
