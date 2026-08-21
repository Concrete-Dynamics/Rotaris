---
req-id: SWR-3621
status: draft
trace: required
test: required
title: "Image attachments in the desktop prompt"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3621 — Image attachments in the desktop prompt

The Rotaris desktop prompt must let a user attach one or more image files to a
prompt — by dragging files onto the composer or via a file picker — and the
attached images must be delivered to the model together with the prompt text as
image content in one user message. Sending with an attached image is hard-blocked
with a clear error when the selected model cannot accept images. Rotaris never
silently drops an attachment.

## Acceptance criteria

- **AC-001** — Dragging an image file onto the composer attaches it; a file-picker
  entry point achieves the same result.
- **AC-002** — PNG, JPEG, GIF, and WebP files are accepted; any other format is
  rejected at attach time with a message naming the rejected format.
- **AC-003** — A file larger than 5 MB is rejected at attach time with a message
  stating the limit.
- **AC-004** — A message accepts multiple attachments up to 20 images and 32 MB
  total; attaching beyond either limit is rejected with a clear message.
- **AC-005** — Attached images appear in the composer as removable previews;
  removing one attachment leaves the others and the prompt text intact.
- **AC-006** — On send, the prompt text and every attachment are delivered as one
  user message and the model receives the images alongside the text.
- **AC-007** — When the selected model has no image-input capability, sending is
  blocked before dispatch; the error names the model and the reason, and the
  prompt with its attachments stays editable.
- **AC-008** — A sent prompt renders its attachments as visible image previews in
  the transcript.
- **AC-009** — Queued prompts carry their attachments through the queue.
- **AC-010** — Attachments survive a session snapshot and re-attach: a re-attached
  session shows the same images in its transcript.

## Non-goals

TUI input, CLI/headless `--image` flags, clipboard-paste, image generation, OCR
tooling, and auto-resizing beyond rejection.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user attaches a PNG inside the size limit; the attachment is accepted and removable | Format/size/count rejection decisions; capability-gate decision | `apps/rotaris/tests/test_image_attachments.py` (attach validation); unit test for the vision-capability gate |
| Integration | A prompt with two images is dispatched; the delivered user message contains both images plus text | Engine message assembly; no-vision-model block; snapshot round-trip preserves attachments | `apps/rotaris/tests/test_image_attachments.py` (dispatch against a fake run bridge); engine-side message-construction test |
| User-flow E2E | A user drag-drops a PNG, sends the prompt, and the model-side recorder observes the image in the received message | Public product boundary → user-observable result | Hermetic `pytest-qt` desktop flow: drag-drop → send → fake LLM records image content; blocked path shows the error and keeps the prompt editable |

## Implementation notes

- The OpenHands SDK message model already carries image content, and terminal
  screenshots already reach the model as images — the engine seam exists; the
  missing part is user-supplied input and its validation.
- The model registry already records a per-model vision capability, which is the
  data the AC-007 gate reads.
- Researched references: Claude Code attaches via drag-and-drop, file-path
  reference, and clipboard paste; accepts PNG/JPEG/GIF/WebP; caps 100 images /
  32 MB per request. Codex CLI uses an `--image` flag, the same four formats, and
  ~5 MB practical guidance. Rotaris starts with desktop drag-and-drop plus a file
  picker; the TUI/CLI surfaces are deferred (see Non-goals).

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
