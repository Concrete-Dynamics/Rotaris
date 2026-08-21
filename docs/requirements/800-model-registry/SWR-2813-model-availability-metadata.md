---
req-id: SWR-2813
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2812
title: "Model availability metadata from discovery to configuration"
epic: SWR-800
date: 2026-08-08
---

# SWR-2813 — Model availability metadata from discovery to configuration

SWR-2812 requires an unusable model to stay visible with its reason attached. The reason
is only knowable at discovery time — it comes from the provider's own catalog payload —
and the surface that has to render it is several layers away, behind the persisted
project snapshot and the loaded configuration. Discovery previously answered the question
by dropping the model, which destroys the information at the only point where it exists.

The reason text itself must have a single home. It is needed both by the configuration
loader, when something names an unusable model, and by the user interface, when it
renders the picker; two independently worded copies would drift.

The product MUST therefore:

- Classify each discovered chat model during discovery as available, or as unavailable
  with a machine-readable cause, and record that classification on the model's catalog
  metadata. The recognised causes are a provider policy that has the model switched off
  for the account, and a model that advertises no endpoint Rotaris can dispatch to.
- Capture any provider-supplied explanation alongside the cause, so the presented reason
  can be specific rather than generic.
- Preserve the classification through the persisted project snapshot, so a picker opened
  without a fresh discovery call still explains itself.
- Keep an unavailable model out of the model configuration that model construction reads
  from, and expose it through a separate informational collection instead, so no code
  path can build a client for it by accident.
- Let an explicit user-authored model definition continue to win: a model the user has
  fully declared in configuration is a configured model, and MUST NOT also be reported as
  unavailable.
- Fail with the classification's reason when configuration names an unavailable model,
  rather than falling through to a provider request that fails later and opaquely.
- Resolve the human-readable reason text for a cause in exactly one place, shared by every
  consumer.

## Acceptance criteria

- Discovery keeps a policy-disabled chat model and a chat model with no dispatchable
  route, each tagged with its own cause; a non-chat model type is still withheld; an
  available model's existing routing metadata is unchanged.
- The classification survives a snapshot write and read and reaches the loaded
  configuration.
- Loading configuration places unavailable models in the informational collection and
  never in the model map used for construction.
- A complete user-authored definition for the same model id yields a configured model and
  no unavailable entry.
- Requesting an unavailable model raises an error carrying that model's reason text.

Derived from: [SWR-2812 — A model the provider will not accept must stay visible, must not be selectable, and must state why](../800-model-registry.md)

Epic: [Model Registry](../800-model-registry.md)
