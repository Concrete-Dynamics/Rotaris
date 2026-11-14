## The Workspace pane's project-setup failure is plain ink and names a build command as the way out

In the Workspace's side pane, under the section that offers "Initialize Project…", a failed project setup is stated as running text in the primary ink: "Last run failed: Code intelligence could not create this project's configuration: … (build it with pnpm code-intel:bundle)". Nothing marks it as a failure but its words, and the recovery it names is a developer's build command, which an operator of an installed product cannot run. The persistent notice raised for the same failure does carry the severity and a "Try again" action.

Noticed 2026-11-14 by an independent critique of the built application for [R-101](../product/requests.md#r-101) (finding C-12 of [the shell's brief](../design/briefs/shell.md)); present at `2fb19824`, before that round's changes. Recorded, not repaired: what an installed product should say in place of a build instruction is the workspace domain's to decide.

## Specs

REQ-SHELL-116 and REQ-NOTIFY-005 give a failure its severity as a rule and a glyph beside its words; the design language's commitment is that a state is said twice, in colour and in words (`docs/design/README/01-1-the-design-language.md`, §1.3). No requirement was found that fixes this sentence's wording.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — the `projectSection` block of the agents pane, which draws the sentence.
- `apps/desktop/src/renderer/main.tsx` — composes the section's hint from the initialization state main reports.
