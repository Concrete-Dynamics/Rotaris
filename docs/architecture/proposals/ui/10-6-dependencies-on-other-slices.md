# Architecture proposals — UI slice — 6. Dependencies on other slices

Part 10 of 10 of [the ui proposal](../ui.md), which indexes every part.

## 6. Dependencies on other slices

- **Orchestration / monitoring** — the publisher side of every constraint in §2.2 (S1–S13). The
  transcript increment and whole-session snapshot payload types are a shared contract; I consume
  them, I do not define them. Also the plan-gate, quota-wait and message-limit surfaces that
  REQ-ORCH-155 hosts inside my views, and REQ-ORCH-155's 100 ms reflection budget.
- **Sessions and persistence** — the live transcript cap and archive paging that R2 relies on
  (REQ-SESSION-192, REQ-SESSION-131, REQ-SESSION-160), the split on-disk layout the benchmark's
  capture reads (REQ-SESSION-036, REQ-SESSION-037), and the persisted status vocabulary my
  normalisation maps from (REQ-SESSION-073).
- **Settings and configuration** — the settings category identifiers my notice actions and tab
  restoration use (REQ-CONFIG-269), the desktop preference key registry (REQ-CONFIG-405), the
  workspace/user write-scope rule (REQ-CONFIG-463), and the Display-category controls whose values my
  transcript reads live (REQ-CONFIG-472, REQ-CONFIG-262).
- **Tools and permissions** — the terminal stream control surface, the permission audit log my
  terminal input writes to (X10), and the approval payloads my trailer rows and approval modal render.
- **Model providers** — the image-input and image-cost declarations the composer's attachment gate and
  token estimate depend on (REQ-PROVIDER-149, REQ-PROVIDER-150), the money-rendering rule the status
  strip and KPI surfaces must use and never re-implement (REQ-PROVIDER-121), and the credit states the
  status strip renders (REQ-PROVIDER-130).
- **Library and requirements board** — the library tab names and artifact vocabularies my notice
  actions and artifact dialogs address (REQ-LIBRARY-088, REQ-LIBRARY-103), and the board's own
  preference keys that live in my store.
