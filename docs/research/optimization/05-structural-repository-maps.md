# Structural Repository Maps

Build a versioned, budgeted navigation index that exposes useful source structure without loading complete implementations.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Give the agent a concise view of modules, declarations, signatures, and relationships before it reads implementation bodies. The map is a navigation aid, not a source-of-truth substitute for current files.

Aider documents repository maps containing important symbols and selecting relevant portions with graph ranking under a token budget [1]. Tree-sitter provides incremental syntax parsing [2]. These are reference mechanisms; the storage model, query interface, and consistency rules below are proposed framework-independent contracts.

A syntax parser can identify declarations and syntactic references. It does not automatically provide a sound call graph, dynamic dependency graph, or cross-language semantic resolution. Report that distinction explicitly.

## 2. Design contract and invariants

Every map MUST identify the source manifest and index profile that produced it. A Git commit alone is insufficient when files have uncommitted edits, untracked additions, or editor-buffer overlays.

Entries MUST distinguish extracted facts from inferred relationships. Parsing failures and excluded files MUST be visible as coverage limitations. A partially indexed repository must not appear complete.

Budgeting MUST retain enough context to identify a declaration's owner and location. Do not truncate a signature into a misleading different interface. Deterministic tie-breaking is required so equivalent queries do not churn prompt prefixes unnecessarily.

## 3. Data model and tool interface

```text
SourceManifest {
  manifest_id, workspace_id, file_versions[], overlay_versions[],
  exclusions, parser_profile, dependency_resolver_profile
}
Symbol {
  symbol_id, resource_id, source_version, qualified_name,
  kind, signature, source_span, container_id?, extraction_quality
}
Edge {
  from, to, kind, evidence_reference, resolution_quality
}
MapResult {
  map_id, manifest_id, query, selected_entries[],
  included_files, omitted_count, parse_failures[], budget_usage
}
```

```text
query_repo_map(query?, scope?, focus_symbols?, token_budget)
inspect_symbol(map_id, symbol_id)
find_dependents(map_id, symbol_id, edge_kinds?, limit)
refresh_repo_index(changed_resources?)
```

Symbol IDs are scoped to an index generation unless a tested identity-preservation algorithm exists. The same name may occur in several scopes, overloads, generated files, or languages. A name alone is not an identifier.

## 4. Implementation workflow

Enumerate source resources with explicit ignore rules and size limits. Capture a coherent manifest of file versions and overlays. On a mutable workspace, revalidate the inventory and versions before publication, or advertise per-file consistency instead of a globally atomic snapshot. Parse each supported file into declarations and local references; unsupported files retain a file-level entry rather than disappearing silently.

Cache parse results by exact content digest, parser version, grammar version, and extraction-query version. Publish an index generation atomically only after its manifest and coverage report are ready. Background partial generations can exist, but query results must name them and state their incompleteness.

Resolve imports or references using language-aware adapters where available. Store unresolved references as unresolved, not as invented edges. Build different graphs for module dependencies and approximate symbol references rather than mixing their meanings.

Rank candidates using task terms, focused files/symbols, lexical relevance, and graph proximity. This guide does not prescribe a universal scoring formula. Make weights versioned and evaluate them against navigation tasks. Exact symbol/path matches should not be drowned out by popularity alone.

Pack whole entries into the token budget. Include owners, relevant signatures, and evidence locations. Use the target model's tokenizer where available, otherwise a conservative estimator labeled as approximate. Deduplicate repeated declarations and report omissions.

When the model follows a map entry, fetch source from its stated version or explicitly refresh to the current version. Never silently use stale map line numbers to mutate live files.

## 5. Reference pseudocode

```text
function build_generation(workspace):
    manifest = capture_source_manifest(workspace)
    entries = []
    for file in manifest.files:
        key = digest(file.bytes, parser_profile, extraction_profile)
        parsed = parse_cache.get_or_compute(key)
        entries.extend(attach_provenance(parsed, file))
    graph = resolve_edges_with_quality_labels(entries, manifest)
    return atomically_publish(manifest, entries, graph, coverage)

function query_map(request):
    generation = choose_explicit_generation(request)
    candidates = lexical_and_structural_candidates(generation, request)
    ranked = stable_rank(candidates, request, ranking_profile)
    selected = pack_complete_entries(ranked, request.token_budget)
    return selected with generation.id, omissions, coverage
```

## 6. Worked example

For a request about login expiry, a bounded map might return:

```text
manifest: manifest_12; coverage: 87/89 source files parsed
src/auth/session
  SessionService.refresh(sessionId): Session
  depends_on: TokenStore [resolved import]
src/auth/token-store
  TokenStore.find(id): Token?
  TokenStore.expire(id): void
tests/auth/expiry
  expired_session_requires_login [test declaration]
```

The agent can inspect the refresh implementation and the expiry test immediately. It does not need every declaration in unrelated packages. If `session` has changed since indexing, the source service returns a fresh snapshot and the map is marked stale until refreshed.

The displayed module relationship is a resolved import, not a claim that every execution of `refresh` calls `expire`.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `INDEX_STALE` | Live source differs from indexed manifest. | Refresh affected files or inspect the indexed snapshot explicitly. |
| `PARTIAL_INDEX` | Some resources were not processed. | Show coverage and use direct search for missing areas. |
| `PARSE_FAILED` | Syntax/grammar prevented extraction. | Keep file-level navigation and error evidence. |
| `UNRESOLVED_REFERENCE` | Target cannot be proven. | Use lexical search or a semantic resolver. |
| `BUDGET_TOO_SMALL` | No complete useful entry fits. | Return minimal location metadata and required budget. |
| `SYMBOL_EXPIRED` | Index generation was reclaimed. | Re-query the current map. |

## 8. Integration and lifecycle

[Version-aware caching](10-version-aware-tool-result-caching.md) stores parse and query results. [Editable search](06-editable-search-results.md) converts navigation into fresh source snapshots. [Change-aware verification](13-change-aware-verification.md) may use dependency edges only if their semantics and completeness meet its stronger requirements.

Prefer lazy task-focused map queries to injecting a frequently changing full map into a cached prompt prefix. [Prompt assembly](08-cache-friendly-prompt-assembly.md) should place dynamic maps after stable instructions.

Invalidate index components on source, ignore-rule, grammar, resolver, and generated-code changes. File watchers are hints, not the only consistency mechanism: reconcile against actual manifests to handle missed events, renames, and branch switches.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Dirty and untracked source | Manifest includes actual workspace content. |
| Unsaved editor overlay | Source authority is explicit and consistently used. |
| Duplicate/overloaded symbol names | Distinct symbol identities remain available. |
| Syntax error | Coverage reports failure without inventing declarations. |
| Unsupported language | File remains discoverable. |
| Dynamic import | Edge is unresolved/approximate, not falsely complete. |
| Identical repeated query | Stable ordering for same manifest and profiles. |
| Tight token budget | Whole entries fit and omissions are disclosed. |
| Missed watcher event | Manifest reconciliation catches stale content. |
| Parser/extractor upgrade | Cached parse entries are invalidated. |

## 10. Metrics and rollout

Measure navigation calls before the first correct file read, token use, relevant-symbol recall, stale-map encounters, and time to solve tasks. Build a task set with known relevant locations, including rarely referenced modules so popularity bias is visible.

Start with file inventories and exported declarations. Add dependency resolution and ranking incrementally. A more sophisticated graph is useful only if its extraction and retrieval improve task outcomes relative to lexical search.

## 11. Implementation checklist

- [ ] Capture versioned manifests including dirty files and overlays.
- [ ] Extract declarations with provenance and coverage reporting.
- [ ] Separate syntax references from resolved semantic dependencies.
- [ ] Cache parsing by content and extraction profile.
- [ ] Rank deterministically and pack complete entries under budget.
- [ ] Refresh stale locations before editing or verification planning.

## 12. References and further reading

[1] [Aider, Repository map](https://aider.chat/docs/repomap.html) - symbol-oriented repository context and graph-ranked budget selection.

[2] [Tree-sitter introduction](https://tree-sitter.github.io/tree-sitter/) - incremental concrete-syntax-tree parsing and language adapters. Syntax parsing alone is not whole-program semantic analysis.
