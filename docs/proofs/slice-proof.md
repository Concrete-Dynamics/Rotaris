# `slice-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/slice-proof.mjs`](../../apps/desktop/scripts/slice-proof.mjs).

Sign-in through the product and one run on a real model — since 2026-10-02 (R-068) the live-run registry's endpoint (`~/.rotaris/live-run/endpoints.json`: its default, or `--endpoint=<name>`) with its stored key; `--paste-key` for one whose key is not stored. It asserts only what a requirement fixes about the model's answers (`lib/live-answers.mjs`), and every red is kept under `.proof/slice-proof-reds/`. Runs on `live-run`'s terms ([When to run it](../../AGENTS.md#when-to-run-it))
