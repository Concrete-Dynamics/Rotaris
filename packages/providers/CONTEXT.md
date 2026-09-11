# Providers

Where models come from, how a user proves they may use them, and how a model gets chosen for a piece
of work. Credentials live per user and never reach a log, a configuration snapshot or a workspace
file.

Terms are derived from `docs/spec/04-model-providers-auth.md`, with the slot and tier vocabulary
from `docs/spec/15-settings-configuration.md`. What a *key* is called and where it is written
belongs to [Configuration](../config/CONTEXT.md).

## Language

### Providers and sign-in

**Provider**:
One source of models — a fixed catalogue entry or a user-defined OpenAI-compatible endpoint. —
`REQ-PROVIDER` overview
_Avoid_: vendor, backend, API

**Provider id**:
The stable identifier a provider is keyed by, in the credential store and in the snapshot. —
`REQ-PROVIDER` identifiers

**Connection mode**:
How the product reaches a provider: `local-sdk`, `rotaris-cloud`, `direct`, `custom`. —
`REQ-CONFIG` vocabularies

**Credential**:
The stored proof of a sign-in, held per provider in the per-user data directory, transparently
refreshed, and never written to logs, configuration snapshots or workspace files. —
`REQ-PROVIDER` credential persistence
_Avoid_: token (a token is one field of a credential), secret (that is the tool-server word),
API key (that is one sign-in method)

**Sign-in method**:
One of the three ways a credential is obtained — a device-code flow, a browser
authorization-code-with-PKCE flow, or a pasted API key or token. — `REQ-PROVIDER` overview

**Provider status**:
The classification shown for a provider: `checking`, `coming_soon`, `error`, `healthy`,
`unauthenticated`, `unknown`, `warning`. — `REQ-NOTIFY-200`

**Lease**:
A resolved bearer handed to the process that needs it for the duration of a run. The run host is
leased one and never reads the credential store itself. — `REQ-PROVIDER` run-time credential priming

### Models

**Catalog**:
A provider's set of models as the provider itself reports them, obtained over the wire or from a
fixed offline list. — `REQ-PROVIDER` model discovery
_Avoid_: model list, inventory

**Discovery**:
The act of fetching a catalog and recording it. — `REQ-PROVIDER` catalog sync

**Snapshot**:
The machine-written per-user record of discovered providers and models, merged into the effective
configuration at load time. It is written by the product, not by a person, and a secret-like key or
value aborts the write. — `REQ-PROVIDER-086`, `REQ-CONFIG` discovery snapshot
_Avoid_: cache

**Qualified model id**:
The form a model is named by in the snapshot and in a slot, identifying the provider as well as the
model. — `REQ-PROVIDER` identifiers

**Model slot**:
A named position work is routed through rather than a model name written at the point of use:
`small_model`, `medium_model`, `large_model`, plus `fallback_model` and
`default_summary_model`. — `REQ-CONFIG-064`, `REQ-CONFIG-065`
_Avoid_: model setting, default model

**Tier alias**:
The alias a model resolves through to a tier; a role's tier is that of the model it is configured
on. — `REQ-CONFIG-070`, `REQ-CONFIG-071`, `REQ-ORCH-019`

**Reasoning level**:
The effort a model is asked for. The slot and model vocabulary is `auto`, `low`, `medium`, `high`,
`max`; a role additionally accepts `default` and `provider_default`. — `REQ-CONFIG` vocabularies
_Avoid_: thinking budget, effort (that is the narrower value forwarded unchanged to a provider)

**Unavailable-model reason**:
Why a model in a catalog cannot be used — `not-entitled`, `deprecated`, `retired`,
`region-restricted`, `quota-exceeded`, `unsupported`, `unknown`. — `REQ-CONFIG` vocabularies

### Accounting

**Subscription usage**:
What a provider reports about a plan's consumption, rendered from a contract the product consumes
rather than defines. — `REQ-PROVIDER` subscription usage endpoints

**Credit**:
The standing of a hosted account, in one of four states rendered as one readable label each —
Funded, Out of credit, Overdrawn, Unknown state. — `REQ-PROVIDER-130`
_Avoid_: balance, quota (a **quota** is a provider's rate limit, and waiting on one belongs to the
[Run](../engine/CONTEXT.md) context)
