# Open questions — Spikes, and the questions raised since (8 of 35)

Part 41 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-183; OQ-178 – OQ-182, OQ-184 archived in [the archive](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md).

- OQ-178 — Which notice offers REQ-NOTIFY-045's retry, when a notice carries one action?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md#oq-178)
- OQ-179 — What does the recovery dialog's re-authenticate path offer for a provider whose key the model configuration carries?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md#oq-179)
- OQ-180 — Where does a board run that stops at its iteration limit rest, and does automatic scheduling start it again?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md#oq-180)
- OQ-181 — Where does REQ-NOTIFY-071's prompt stand "beside the continuing run", and is it drawn while the window shows another view?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md#oq-181)
- OQ-182 — What is REQ-NOTIFY-070's restart "with the same prompt", what does "the fallback bookkeeping is cleared" take back, and how long does "the …; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md#oq-182)

**OQ-183 — Does REQ-NOTIFY-045's "current composer draft" include the images the composer holds?** *(REQ-NOTIFY-045,
"resubmits the current composer draft"; REQ-NOTIFY-066, the draft stored under `composerDraft`; REQ-CHAT-014, the draft
published to application state; REQ-CHAT-011/170/171/172, a submission's attachments and their gates. Raised 2026-10-02 by
the repair of
[`the-retry-action-resubmits-a-prompt-without-its-images.md`](../../defects/fixed/the-retry-action-resubmits-a-prompt-without-its-images.md)
(fin8). Open.)*

**Deferred 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)).**

The retry resubmits "the current composer draft" where there is one. The composer holds images beside its text
(REQ-CHAT-170..172), but the draft the specification stores and publishes (REQ-NOTIFY-066, REQ-CHAT-014) is text, and
nothing says whether images held in the composer at the moment a notice's retry is activated belong to "the draft" the
retry resubmits, or stay in the composer for the user's own submission.

**What the build proceeds under** (`retryRun`, `apps/desktop/src/renderer/session-actions.ts`): a non-blank draft is
resubmitted as its text alone, as the stored and published draft is text; images held in the composer are not sent by
the retry and stay where they are. A blank draft resubmits the session's last submitted prompt with its images
(`Sessions.retry`, OQ-178's reading since 2026-10-02).

**What a ruling decides.** Whether a retry of a non-blank draft carries the images the composer holds (and so whether the
composer publishes them to application state as it does its text), and whether they are then cleared from the composer.

- OQ-184 — Where does REQ-SANDBOX-121's workspace indicator stand, and in what words?; ruled 2026-10-06; [archived](../../archive/architecture/open-questions/41-spikes-and-later-questions-8.md#oq-184)
