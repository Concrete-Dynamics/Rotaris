[Product directives](../directives.md) › PD-CHAT-016

<a id="pd-chat-016"></a>

### PD-CHAT-016 — a skill entering an agent's context is marked in the transcript

When a skill enters an agent's context, the transcript SHALL say so with a **skill-load marker**: one system-notice row
(REQ-CHAT-046's `system` category; no thirteenth category) placed where the load happened. The marker records an event
at a point in time. It never claims the skill is still in context, and no other surface gains a per-skill indicator.

1. **What counts as a load.** Two acts, and no other:
   - **The agent's own read.** A `read_file` or `haet_read` call that settles `ok` and whose path is, exactly, the
     `SKILL.md` of a skill in the session's catalog (REQ-WORKSPACE-059, REQ-WORKSPACE-061). A read of another file in a
     skill's directory, a read that fails, and a shell command that prints the file mark nothing.
   - **The user's force-load.** Invoking a skill's command (REQ-CHAT-034, REQ-WORKSPACE-073), `/skill <path>`
     (REQ-CHAT-162, REQ-WORKSPACE-057), or the Settings Skills tab's "Load skill file…" (REQ-WORKSPACE-151), for the
     session the window follows.

   A skill whose load mode is `always` reaches every agent built and is not marked: its body is not an event.
2. **One per agent per run.** An agent's repeated reads of the same `SKILL.md` within one run mark it once. A later run,
   or another agent in the same run, marks it again: each is a fresh entry into that agent's context.
3. **What it says.** One line: `Skill loaded`, the skill's normalized name, and who loaded it — `by <agent name>` for the
   agent's read, `by you` for a force-load. No description, scope or path; nothing on it is a control. The row's text is
   `Skill loaded: <name> — by <agent name>` or `Skill loaded: <name> — by you`, so an export or a search reads it as the
   sentence it is.
4. **It replaces the force-load's toast.** Where a force-load writes its marker, REQ-CHAT-034's and REQ-WORKSPACE-073's
   notice "Skill loaded for the next prompt: <name>" and the `/skill` command's "Skill loaded for this session: <name>"
   are not shown. Where no transcript can be written (no session is loaded for the window), the toast is shown as
   before. The Settings Skills tab's "Load skill file…" keeps its own message (REQ-WORKSPACE-151): it is not a chat act.
5. **Saved with the session.** The marker is written through the session's own writer, as REQ-CHAT-162's listing is: it
   is in the store, in every window following the session, in a reopened session and in the trajectory export.
6. **It does not break an activity line.** A marker closes no run of PD-CHAT-004: the agent's activity line keeps
   counting across it, and the marker is drawn beneath the line it interrupts.

**Drawn as.** The system notice's rule and nothing heavier: no fill, no radius, no axis colour, since loading a skill is
not a state of the work. `Skill loaded` in the secondary ink, the name in mono at the primary ink, `by …` in the
tertiary ink; one line at the dense text size that elides the name rather than wrap, the full sentence its accessible
name and its title. The attribution gutter carries nothing: the `by` clause is the attribution.

**Why, and what it costs.** The owner wants to see which skills an agent used while reading the run, and the read that
loads one folded into the activity line where nobody saw it. What it costs: a marker per agent per run per skill in the
transcript, and the owner's ESC-37 ruling ("no in-context indicator … anywhere") revised for this event row. The marker
is not an indicator of present state, and no composer chip exists.

> **Narrows:** REQ-CHAT-034, REQ-CHAT-162, REQ-WORKSPACE-073

*Raised by the owner, 2026-11-21, after a grilling session; logged as [R-118](../requests.md#r-118). The owner chose to
revise ESC-37 ([owner decisions, part 12](../../architecture/owner-decisions/12-rulings-after-the-gate-2026-09-27.md)),
whose "no in-context indicator … anywhere" would otherwise forbid the marker.*
