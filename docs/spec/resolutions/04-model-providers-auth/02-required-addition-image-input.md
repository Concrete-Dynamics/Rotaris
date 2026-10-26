# Resolution Record — Domain 04, Model Providers, Sign-In, and Model Routing — Required addition — image input

Part 2 of 3 of [domain 04's resolutions](../04-model-providers-auth.md), which indexes every part.

## Required addition — image input

The conversation domain gates image attachments on a declaration this domain owns (REQ-CHAT-171) and
prices them on a cost this domain owns (REQ-CHAT-174). Both are now stated here.

- **REQ-PROVIDER-149** gives every model entry an `accepts_image_input` boolean in its capabilities
  object, populated from three sources with a stated precedence — an explicit YAML declaration
  first, then the provider's own report from the most recent successful discovery (codex input
  modalities, or a generic provider's capabilities object), then the shipped model-capability
  metadata. A later discovery replaces a discovered or metadata-derived value and never overrides an
  explicit YAML declaration. **A model that declares nothing does not announce image input**: absent
  is read everywhere as closed, so the REQ-CHAT-171 gate fails closed and a model with no
  declaration is presented exactly like one declaring false. The declaration is observable wherever
  models are listed or selected — the provider list, the assignment editor, the model picker, and
  runtime override selection — as one labelled indicator, never colour alone (REQ-SHELL-149). It is
  never inferred from a model's name.
- **REQ-PROVIDER-150** adds an optional image token cost — a fixed `image_input_tokens` count, an
  `image_input_tokens_per_megapixel` rate, or both — populated by the same sources under the same
  precedence. The estimator prefers the rate when the image's dimensions are readable, else the
  fixed count. **Where neither is available the cost is unknown**: the estimator must not guess and
  must not count zero, but treats the attachment as an unknown non-zero amount and marks the whole
  estimate a lower bound, exactly as REQ-CHAT-174 requires.
- Money: estimated image tokens are ordinary input tokens priced with `input_cost_per_token`, and
  where a provider prices per image instead, that price is a decimal string in the entry's pricing
  block. Either way every amount is computed and rendered under **REQ-PROVIDER-121**, which has been
  amended to say in terms that it is the one money rule for this domain and that it covers the
  per-token pricing carried through discovery and any image pricing REQ-PROVIDER-150 introduces. No
  amount is computed in binary floating point anywhere.
