[Product directives](../directives.md) › PD-WORKSPACE-010

<a id="pd-workspace-010"></a>

### PD-WORKSPACE-010 — a first launch opens on a setup of three steps that ends in the first prompt

1. **When it is shown.** A launch that finds no project to open — the launch REQ-WORKSPACE-007 opens on the folder the
   application started in — SHALL open on the **first-launch setup**, unless the setup has already ended for this
   installation. Once begun, the setup is owed at every later launch, whatever that launch opens, until it ends. It ends
   once, by being carried through or by its own **Skip setup** control, and is never shown again. A launch that names its
   project, and an installation that already remembers one, never begins it.
2. **What it is.** A surface over the whole window, drawn before the shell is seen and modal to it: the views beneath take
   no focus and no chord while it stands. It keeps the window's title bar and its frame controls. Skip setup is offered on
   every step and leaves the shell exactly as a launch without the setup would have shown it.
3. **Its steps, in order.** *Project*: REQ-WORKSPACE-009's chooser, opened by the user's own press and never by a timer; where
   the folder the application started in holds a Git repository, that folder is offered first. A chosen folder is
   remembered as `workspace/lastOpened`, the folder the application started in included. *Model*: REQ-WORKSPACE-135's
   steps, carried out in place over the same catalogue, sign-in, discovery and slot assignment; a provider whose sign-in
   this build does not carry is listed, unavailable, with that said. The three tier slots (`large_model`, `medium_model`,
   `small_model`) are stated as assigned and may be changed there; the others stay in Settings › Models.
   *First prompt*: a composer; sending starts a run on the composer's own path and ends the setup.
4. **What it holds back.** While the setup is owed, REQ-SHELL-011's deferred chooser is not scheduled and
   REQ-WORKSPACE-152 (3)'s notice is not published: the setup asks for both. When the setup ends with no provider
   authenticated the notice is published then. Once the setup has ended, a launch that finds no project schedules the
   deferred chooser as before.
5. **The mode.** The setup proposes `autonomous` to every user and says in one sentence what that means; the three modes
   may be chosen there. The chosen mode is written to the project's configuration when the setup is carried through — by
   the first prompt or by opening without one — and is not written by Skip setup. REQ-TOOLS-046's shipped default is
   unchanged for a project the setup never touched.
6. **Its motion.** A step, a fact and a field arrive over `--rt-shift` in `--rt-duration-slow`; the progress and the
   miniature's pieces change state in place. At the end the miniature of the window grows to the window's bounds and the
   surface clears, in no more than three and a half times `--rt-duration-slow`. Each reads REQ-SHELL-135 at its start and
   is drawn at rest under reduced motion.

**As built.** `apps/desktop/src/main/onboarding.ts` (owed, begun, ended; the preference `onboarding/state`),
`MainWindows.chooseForSetup` and `setupOwed` (`main-windows.ts`), the commands `onboarding.read`,
`onboarding.chooseProject` and `onboarding.finish` (`commands/onboarding.ts`), `provider.signIn`'s `quiet`, and the surface
`packages/ui/src/FirstRunSetup.tsx` with `first-run.css`, mounted by the `App` root. Choosing a different folder replaces
the window (REQ-SHELL-017); the replacement reads the facts and opens on the model step.

**Why, and what it costs.** The owner asked for a first launch that is "absolutely smooth", whose "goal is to get
everything set and ready to run the first prompt". As specified, a first launch showed the shell on the folder the
application started in, a folder chooser 650 ms later, a notice about providers, and three places to go before a prompt
could be sent; the starter configuration was written into whichever folder that was. What it costs: REQ-WORKSPACE-152 (3)
forbade exactly this ("never as a dialog opened unbidden", "SHALL NOT gate any view"), and the directive keeps that
sentence true only through Skip setup; the model step is a second surface over REQ-WORKSPACE-135's flow, so a change to the
sign-in is made in two places until the two share one form; device-code and browser sign-in are not built, so two catalogue
entries are dead ends in the setup as they are in the authentication window; and every proof launch holds the setup off
(`ROTARIS_CAPTURE_ONBOARDING=off`, compiled out of a packaged build), so the proofs measure the product as it stands after
the setup and only `onboarding-proof` measures the setup.

**Revision 2 — 2026-11-21 ([R-113](../requests.md#r-113)): the model step carries every sign-in the product has.** The
owner asked for the provider sign-in in the onboarding once device-code, browser and local-tool sign-in existed
(R-111, R-112). Clause 3's model step now starts those in place as it starts a key's: a provider that signs in at the
provider shows its prompt — the code to enter, or the page that opened — in the step, with a control that ends the
wait; `claude-code` shows that the Claude Code tool on the computer is used and asks it
([`PD-PROVIDER-002`](pd-provider-002.md#pd-provider-002)). The prompt and its reading are one piece shared with the
authentication window (`packages/ui/src/sign-in-prompt.tsx`), which pays part of the cost named below: the two
surfaces no longer hold two copies of it. The "dead ends" sentence below described the build of that day and no longer
holds; a provider is still listed unavailable, with its reason, where it is (the hosted provider is not listed, and
`claude-code` where its tool is not installed).

> **Narrows:** REQ-WORKSPACE-152, REQ-WORKSPACE-141, REQ-WORKSPACE-007
>
> **Extends:** REQ-WORKSPACE-135

*Asked by the owner on 2026-11-20 ([R-110](../requests.md#r-110)), who chose the full-window form, the autonomous default
with its sentence, the slot choice as the optional tier and the prompt as the last step, and then the third of three
sketched structures ("The workspace assembles").*

> **First execution, 2026-11-21.** Built the day after it was asked. **What was measured.** In the built application on
> Linux, a fresh profile with no project: the launch opened on the setup with no chooser scheduled and no notice; a chosen
> folder replaced the window and the replacement opened on the model step; a key for a self-hosted OpenAI-compatible
> endpoint signed in, one model was discovered and assigned to the three tier slots; a relaunch resumed at the facts; the
> first prompt started a run, `permission_mode: autonomous` stood in the project's `agents.yaml`, and the shell beneath was
> on the Workspace with the run active. **What it found.** The surface's step-change focus fired on first mount under
> React's strict mode and ringed the heading; it now compares the shown step. The miniature's status line let a long path
> widen the miniature past its column; its columns now have a zero minimum.
