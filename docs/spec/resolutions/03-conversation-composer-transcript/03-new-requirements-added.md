# Resolution Record — Domain 03, Conversation, Composer, and Transcript — New requirements added

Part 3 of 3 of [domain 03's resolutions](../03-conversation-composer-transcript.md), which indexes every part.

## New requirements added

| ID | Section | Why it exists |
| --- | --- | --- |
| REQ-CHAT-158 | 1. Desktop Composer | Run-timing indicator: per-model-call elapsed while running, frozen at total wall-clock at a terminal state. Rescues REQ-CHAT-105, REQ-CHAT-106. |
| REQ-CHAT-159 | 5. Slash Command Catalogue | Outcome pattern for every argument-taking catalogue command, plus `/theme <name>` and `/logout <provider>`. Rescues part of REQ-CHAT-118; resolves OQ 14. |
| REQ-CHAT-160 | 5. Slash Command Catalogue | Prompt-file commands: three roots in priority order, naming, frontmatter, collision rule. Rescues REQ-CHAT-121; the draft's `~/.codex/prompts/` root is replaced by roots consistent with REQ-WORKSPACE-051. |
| REQ-CHAT-161 | 5. Slash Command Catalogue | Placeholder expansion and positional splitting. Rescues REQ-CHAT-122; resolves OQ 29. |
| REQ-CHAT-162 | 5. Slash Command Catalogue | Skill listing, manual skill loading, and the attached-skill payload. Rescues REQ-CHAT-123, REQ-CHAT-124; resolves OQ 30. |
| REQ-CHAT-163 | 9. Transcript Rendering | Stream-to-display rules and three-shape reasoning recognition. Rescues REQ-CHAT-131. |
| REQ-CHAT-164 | 9. Transcript Rendering | Provider-stall indicator at 10 s. Rescues part of REQ-CHAT-129; resolves OQ 31. |
| REQ-CHAT-165 | 9. Transcript Rendering | Bounded resident rows with on-demand paging from the session record. Rescues REQ-CHAT-140, REQ-CHAT-141, REQ-CHAT-139, REQ-CHAT-126; makes OQ 34 moot. |
| REQ-CHAT-166 | 10. Tool, Thinking, and Grouped Rows | Tool result and input visibility with line caps, in the `display` section of `agents.yaml`. Rescues REQ-CHAT-132 and the `/tools` capability of REQ-CHAT-118. |
| REQ-CHAT-167 | 10. Tool, Thinking, and Grouped Rows | Global reasoning-visibility preference, default off, in the desktop preference store. Rescues REQ-CHAT-128. |
| REQ-CHAT-168 | 27. Cross-Cutting Invariants | Parenthetical plural markers are illustrative; counted messages must inflect. Resolves OQ 18. |
| REQ-CHAT-169 | 29. Image Attachments | The attachment surface: drag-and-drop and file picker, the ordered removable list, and submission carrying text and attachments as one prompt. Resolves OQ 2. |
| REQ-CHAT-170 | 29. Image Attachments | Accepted media types, per-file and per-submission ceilings, and the rejection report. Resolves OQ 2. |
| REQ-CHAT-171 | 29. Image Attachments | The model-capability gate: attachment affordances are enabled only for a model that announces image input. Resolves OQ 2. |
| REQ-CHAT-172 | 29. Image Attachments | Model selection while attachments are held: no silent selection that would discard them. Resolves OQ 2. |
| REQ-CHAT-173 | 29. Image Attachments | Storage under the session directory, reference by path and digest in the snapshot, and re-projection on reopen. Resolves OQ 2. |
| REQ-CHAT-174 | 29. Image Attachments | Token estimation counts attachments, and marks the estimate a lower bound where the model declares no image cost. Resolves OQ 2. |


> ## Amendment, 2026-09-02
>
> **Owner ruling GD-1 closes OQ-31 and fixes the Markdown dialect in `REQ-CHAT-056`.** No prior disposition
> in this record is reversed; the requirement gains what it never stated.
>
> **What was open.** `REQ-CHAT-056` named five treatments — fenced code blocks, bold, italic, inline code
> spans, hyperlinks — and required links to be activatable. Nothing said whether headings, block quotes,
> lists, task lists, tables or images were supported. The architecture record carried this as OQ-31 and
> blocked it on the approved visual design reference, calling it "as much a visual question as a functional
> one".
>
> **Why that framing was wrong.** The supported element list does not decide how the transcript looks; it
> decides **what the renderer will accept from model output**. That makes it a question about the surface a
> model's output reaches, and the entry's own closing sentence — that images interact with the
> no-network-request rule — was the evidence for it. A palette does not have to arrive first.
>
> **The dialect, as ruled: GitHub Flavored Markdown, less raw HTML, less image loading.** Headings, block
> quotes, ordered and unordered lists, task lists, tables, thematic breaks and strikethrough render
> alongside the five treatments already fixed, and a bare URL in text is a hyperlink on `REQ-CHAT-076`'s
> terms like any other.
>
> **Raw HTML in Markdown source is shown as text and never rendered as markup.** Rendering agent output as
> markup would let every model response introduce elements into the surface the user reads their workspace
> through. Nothing this requirement fixes needs it, and the cost of allowing it is not bounded by anything
> the requirement states.
>
> **No image is ever loaded from a Markdown image reference**, which is the part worth recording the
> reasoning for. An image reference renders as its alternative text carrying an activatable reference. For a
> remote location the requirement already forbade it — rendering "MUST NOT issue any network request" — but
> leaving the local case to follow from that would have been an invitation to conclude that a local path is
> therefore fine. It is not, for two independent reasons: a transcript that reads locations named by model
> output discloses whatever those locations hold, and reading one is a filesystem access the same clause's
> synchronous-completion rule does not accommodate. Stating it as a dialect rule rather than as a
> consequence is what makes it survive a later reader.
>
> **Boundary.** This governs what Markdown *syntax* may cause to be loaded. Images the user attaches
> (`REQ-CHAT-169` to `REQ-CHAT-174`) and image bodies the product holds as per-session files
> (`REQ-SESSION-002`) are governed where they already are and are untouched.
