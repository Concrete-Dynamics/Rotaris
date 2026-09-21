# Lazy Tool Discovery and Loading

Expose a small initial tool surface and load exact, versioned tool contracts only when relevant to the task.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Avoid including a large catalog of unused tool schemas in every model request. Keep frequently used tools eager, expose a compact discovery operation, and load detailed contracts for selected capabilities.

Both OpenAI and Anthropic document tool-search/deferred-loading mechanisms [1][2]. Provider-native details differ. This guide defines the runtime state and transitions needed to implement the same idea through any framework, including providers without native deferred tools.

The optimization controls what the model can discover and call. It is not a substitute for operation authorization, and it is not a claim that fewer visible tools always improve task performance.

## 2. Design contract and invariants

Separate **registered**, **discoverable**, **loaded**, and **authorized** tools. Discovery does not execute a tool. Loading does not grant permission to execute it.

Every loaded tool MUST have a stable qualified identifier, versioned schema, schema digest, and known executor binding. A name collision between providers or namespaces must not route a call arbitrarily.

The dispatcher MUST validate calls against the contract actually made available for that request or provider-native discovery sequence. Returning JSON that describes a tool in an ordinary tool result does not, by itself, add a native callable tool to the next model request.

A schema change MUST create a new version or explicit reload. Pending calls remain bound to the schema version under which they were generated; do not reinterpret their arguments against a different contract.

## 3. Data model and tool interface

```text
CatalogEntry {
  qualified_id, namespace, short_description, use_cases[],
  schema_version, schema_digest, input_schema, output_schema,
  executor_binding, availability, effect_class
}
LoadedManifest {
  manifest_id, catalog_version, loaded_tools[], provider_adapter_version
}
```

```text
discover_tools(query, namespace?, max_results)
load_tools(qualified_ids[], expected_catalog_version)
```

```json
{
  "catalog_version": "catalog_9",
  "results": [{
    "qualified_id": "git_host.pull_request.read@2",
    "description": "Read a pull request and its current review state.",
    "schema_digest": "schema_82",
    "loaded": false,
    "available": true
  }]
}
```

An implementation may combine discovery and loading. It must still record both decisions and return the precise loaded contracts. Keep the discovery mechanism itself eager; a capability must not require its own undiscoverable tool to discover it.

## 4. Implementation workflow

Create a registry of trusted executor bindings and complete schemas. Index concise capability descriptions, useful nouns/verbs, namespaces, and representative use cases. Support lexical lookup and exact identifiers before adding semantic search complexity.

Choose an eager core using measured frequency: source tools, observation retrieval, process inspection, and discovery are plausible candidates, not universal requirements. Give the discovery tool enough catalog metadata to locate less common capabilities without injecting all full schemas.

On discovery, filter unavailable and inapplicable entries, rank results deterministically where scores tie, and return a bounded set. On load, validate catalog/schema versions and update an immutable manifest. Repeated loading of the same version should be idempotent.

For an ordinary function-calling API, finish the discovery tool result, then construct the **next model request** with the selected native schemas included. The model can then issue validated calls. If the provider offers native tool search within one response, use that supported mechanism and record its loaded subset [1].

Do not assume the tools can be swapped halfway through an arbitrary in-flight model generation. A response containing a call to an unavailable tool must be rejected or explicitly resubmitted through a valid loading transition, not opportunistically executed.

Unloading is optional. Prefer stable loaded subsets during a short task phase. If a tool is retired, stop new calls while resolving already-issued calls explicitly. Preserve the conversation's required call/result history even when the tool is no longer available for future use.

## 5. Reference pseudocode

```text
function on_discovery_call(request, session):
    matches = registry.search(request.query, session.scope)
    selected = choose_bounded_available_entries(matches)
    contracts = registry.load_exact_versions(selected)
    manifest = session.loaded_manifest.add_idempotently(contracts)
    return discovery_result(contracts, manifest.id)

function next_model_request(session):
    native_tools = adapter.render_loaded_contracts(session.loaded_manifest)
    return adapter.request(session.messages, native_tools)

function dispatch(call, request_manifest):
    contract = request_manifest.resolve(call.qualified_id)
    require contract exists else TOOL_NOT_LOADED
    validate(call.arguments, contract.input_schema)
    check_current_authorization(call, contract)
    return invoke_bound_executor(contract, call.arguments)
```

Provider-native discovery may change the manifest within its documented generation sequence. Treat that as an explicit adapter capability, not a generic behavior all runtimes possess.

## 6. Worked example

The initial model request exposes source editing, process tools, observation retrieval, and discovery. The user asks about a pull request. Discovery returns the read and comment capabilities in a Git-host namespace; the harness loads only the read contract for the present task.

The next request includes `git_host.pull_request.read@2` with its exact schema. The agent invokes it. If it later needs to comment, that separate capability is discovered/loaded and independently authorized.

If the registry upgrades the read tool to version 3 while a version-2 call is pending, the harness either retains the version-2 executor or returns an explicit version-unavailable error. It does not feed version-2 arguments into version 3.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `NO_MATCHING_CAPABILITY` | Discovery found no available match. | Broaden terms or inspect namespace descriptions. |
| `TOOL_NOT_LOADED` | Call was not in the applicable manifest. | Load it and ask the model for a fresh valid call. |
| `CATALOG_CHANGED` | Requested contract version is stale. | Refresh discovery before loading. |
| `SCHEMA_VERSION_UNAVAILABLE` | Bound executor contract was retired. | Report the transition; do not reinterpret arguments. |
| `TOOL_UNAVAILABLE` | Registered service cannot be used now. | Expose availability and a supported alternative if known. |
| `DISCOVERY_LOOP` | Repeated searches make no progress. | Return a broader catalog summary or stop with a capability gap. |

## 8. Integration and lifecycle

[Prompt assembly](08-cache-friendly-prompt-assembly.md) must account for tool schema placement. Deferred loading can reduce initial prompt size while changing schema prefixes later. Use provider-native append behavior where supported; otherwise measure the cache cost of changes rather than promising preserved cache hits.

[Checkpoints](11-execution-checkpoints.md) store loaded manifest references and catalog versions. On resume, revalidate availability and authorization before reconstructing native schemas. A restored name without its exact contract is insufficient.

Treat tool descriptions as registry data, not executable instructions from an arbitrary search result. Preserve existing authorization checks at dispatch. This document intentionally does not redesign that policy system.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| No discovery needed | Eager core completes common tasks directly. |
| Discovery then invocation | Exact schema is available before the call executes. |
| Schema merely printed in text | Tool does not become callable accidentally. |
| Same name in two namespaces | Qualified identifiers route deterministically. |
| Repeated load | No duplicate schemas or manifest drift. |
| Catalog changes during turn | Calls remain bound to their original version. |
| Parallel unknown call | Dispatcher rejects it rather than guessing. |
| Tool revoked after discovery | Authorization is checked again at execution. |
| Checkpoint resume | Contracts are rehydrated and verified. |
| Native-provider versus fallback adapter | Both expose equivalent logical availability transitions. |

## 10. Metrics and rollout

Track schema tokens, discovery calls, capability recall, wrong-tool selection, load churn, cache hit rate, and task latency. Evaluate rare capabilities as well as frequent ones; a small initial prompt is not useful if relevant tools become undiscoverable.

Start by deferring infrequently used namespaces. Keep a full-catalog baseline and compare task outcomes. Do not optimize only the first request: account for all discovery and reload rounds across the run.

## 11. Implementation checklist

- [ ] Maintain a qualified, versioned tool registry and executor bindings.
- [ ] Separate discovery, loading, and authorization state.
- [ ] Implement next-request native schema installation for fallback providers.
- [ ] Bind each call to its applicable loaded manifest.
- [ ] Handle version changes and pending calls explicitly.
- [ ] Evaluate capability recall and total-run costs.

## 12. References and further reading

[1] [OpenAI, Tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) - native deferred tools, namespaces, and provider-specific loading sequences. Check supported models and APIs when integrating.

[2] [Anthropic, Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) - another primary implementation of tool discovery/deferred schemas. Neither provider's wire format is required by this guide.
