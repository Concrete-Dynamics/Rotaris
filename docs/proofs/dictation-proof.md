# `dictation-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/dictation-proof.mjs`](../../apps/desktop/scripts/dictation-proof.mjs).

The composer's microphone in the built application (OQ-455 to OQ-459), through Chromium's fake device and the scripted transcriber:
the refusal while the backend is off; what the permission handlers grant and refuse, the clipboard write included; a dictation landing
at the caret without a run starting; and the refusal of a local model absent from the machine. It does not run a model: the two real
clients are `apps/desktop/src/main/dictation/dictation.test.ts`'s.
