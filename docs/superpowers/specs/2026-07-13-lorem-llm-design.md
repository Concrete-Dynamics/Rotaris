# Lorem LLM: deterministic mock LLM content for tests and demo

Date: 2026-07-13
Status: approved

## Problem

Tests that simulate LLM output use 7+ ad-hoc `MockLLM` stub classes with fixed short
strings ("summary text", "ok"). Nothing exercises long messages, markdown rendering,
thinking blocks, or tool-call interleaving. Rotaris `--demo` hardcodes transcript
strings in `store.py`. We want realistic, deterministic, controllable LLM responses
to harden test simulation and demo rendering.

## Decision

Build a zero-dependency, seeded lorem-ipsum markdown generator plus a scriptable
`LoremLLM` mock, shipped in `src/rotaris_core/testing/` so both the test suite and the
Rotaris demo store can import it. Hybrid control model: an explicit turn script
controls structure when a test needs it; a seed fills content, lengths, and markdown
flavor; presets cover "don't care" cases.

No external lorem package: `random.Random` guarantees cross-version stability only
for `.random()`, so the generator draws exclusively from `.random()` via a small
internal helper. Same seed → byte-identical output on every platform and Python
version we support.

## Components

### 1. `rotaris_core/testing/lorem.py` — `LoremMarkdownGenerator`

- `LoremMarkdownGenerator(seed: int)`; all randomness via `random.Random(seed).random()`.
- `words(n) -> str`, `sentence() -> str`, `paragraph(sentences=N) -> str`,
  `markdown(words=n) -> str`.
- `markdown()` mixes: headings, bold/italic, inline code, fenced code blocks,
  bullet and numbered lists, links. Element probabilities overridable via a
  `MarkdownProfile` dataclass (defaults tuned for realistic chat output).
- Pure strings; no heavy imports at module level.

### 2. `rotaris_core/testing/lorem_llm.py` — turn script DSL + `LoremLLM`

Part factories (light dataclasses):

- `text(words=120)` — markdown body text
- `thinking(words=40)` — reasoning content
- `tool_call(name, args=None)` — tool invocation; lorem-filled args when omitted

A turn is a `list` of parts. `LoremLLM(script=[turn, ...], seed=7)`:

- `.completion(messages, **kwargs)` returns a response object with `.message`
  (`openhands.sdk.llm.message.Message`: `TextContent` for text, `reasoning_content`
  for thinking, `tool_calls` list of `MessageToolCall` for tool calls).
- `.calls` records every `messages` argument (existing stub convention).
- Script exhausted → raise `LoremScriptExhausted` (test bug surfaces loud).
- SDK imports stay inside methods (lazy-import rule).
- String-level access for SDK-free consumers: `next_turn_text()` and module-level
  generator use (Rotaris).

Presets — infinite deterministic streams, no script needed:

- `LoremLLM.chatty(seed)` — long markdown text turns
- `LoremLLM.tool_heavy(seed)` — thinking + tool calls + short text
- `LoremLLM.terse(seed)` — short plain sentences
- `LoremLLM.mixed(seed)` — varied lengths, occasional tools/thinking

### 3. Rotaris demo data

`apps/rotaris/src/rotaris/models/store.py` demo transcript/message strings replaced
with generator output (fixed seed): long markdown agent messages, thinking, tool
events. Identical output every launch. `TranscriptEvent` structure unchanged.

### 4. Migration of existing stubs

- Replace ad-hoc content where message *content/length* matters:
  `tests/unit/test_compressor.py`, `tests/unit/test_scheduler.py`,
  `tests/integration/test_compression_e2e.py`,
  `tests/integration/test_orchestrator_e2e.py`, Rotaris chat-rendering tests.
- `tests/unit/test_summary_agent.py` keeps JSON payloads (structured output, not
  prose) — untouched.
- Delete duplicate stub classes where `LoremLLM` replaces them.

### 5. Tests for the mock itself — `tests/unit/testing/`

- Same seed → identical output; different seeds differ.
- Word counts honored within tolerance.
- Script structure honored exactly (part order, tool names, exhaustion raises).
- Markdown output contains expected element types.
- Preset streams stable against snapshot.

## Error handling

- `LoremScriptExhausted` on `.completion()` past end of script.
- Invalid part type rejected at `LoremLLM` construction, not at call time.

## Out of scope

Runtime mock provider selectable in `models.yml` (option C) — possible later on top.

## Versioning

Minor version bump in `pyproject.toml`.
