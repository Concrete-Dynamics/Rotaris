# AUDIT: OMO Pattern Implementation Status in Rotaris

**Date:** 2026-04-16  
**Status:** In Progress  
**Scope:** Identify which OMO patterns are already implemented vs. missing

---

## Executive Summary

Rotaris has **partially implemented** several OMO patterns:

✅ **Already Implemented:**
- Intent classification gate (Phase 0) in orchestrator prompt
- Dynamic prompt rendering with `[[ROTARIS:TOKEN]]` placeholders
- Model-family-specific variants support (config schema + factory)
- Delegation strategy documentation
- Circuit breaker supervision layer
- Todo-driven workflow
- Phase-driven execution pipeline

⚠️ **Partially Implemented:**
- Prompt rendering (basic token substitution, not full OMO dynamic generation)
- Model-specific variants (infrastructure exists, but not actively used in prompts)

❌ **Missing / Not Yet Implemented:**
- Specialized agent personas (only 6 built-in; OMO has 11)
- Momus (plan reviewer) persona
- Metis (pre-planning) persona
- Hephaestus (deep worker) persona
- Sisyphus-Junior (category-spawned) persona
- Multimodal-Looker (vision/PDF) persona
- Explore (codebase grep) persona
- Dynamic prompt generation system (OMO's buildAgentIdentitySection, buildToolSelectionTable, etc.)
- Tool restrictions per agent (read-only vs. write-capable)
- Skill system (3-tier MCPs with scoped injection)
- Hard blocks and anti-patterns enforcement
- Ultrawork mode (parallel all-agents execution)

---

## Detailed Findings

### 1. Intent Classification Gate ✅

**Status:** IMPLEMENTED

**Location:** `src/rotaris_core/agents/prompts/orchestrator.md` (lines 32-44)

**Evidence:**
```markdown
# Intent Classification Gate
Classify every user message into exactly one category before acting:
- Trivial: Single-file change, known location. Action: Direct delegation to a single specialist.
- Explicit: Specific file and line provided. Action: Direct delegation to an implementation persona.
- Exploratory: "Find", "how does", "where is". Action: Delegate to a research-capable persona.
- Open-ended: "Improve", "refactor", "optimize". Action: Phase 1 (Assessment) then Phase 2.
- Ambiguous: Unclear scope or conflicting goals. Action: Ask ONE clarifying question. Stop.
```

**Alignment with OMO:** ✅ Matches OMO's Sisyphus intent gate (5 categories: Trivial, Explicit, Exploratory, Open-ended, Ambiguous)

**User-visible requirement:** ✅ Implemented (lines 40-44)
```markdown
- The first line of your first user-visible response for every task MUST identify the detected
  intent and the immediate plan.
- Use this exact format: `Intent: <Trivial|Explicit|Exploratory|Open-ended|Ambiguous> - <brief plan>.`
```

---

### 2. Phase-Driven Execution Pipeline ✅

**Status:** IMPLEMENTED

**Location:** `src/rotaris_core/agents/prompts/orchestrator.md` (lines 10-30)

**Evidence:**
```markdown
- Phase 0: Intent Classification. Categorize the request and determine the initial approach.
- Phase 1: Codebase Assessment. Spin up the according persona to get a quick overview if needed.
- Phase 2A: Parallel Exploration. Delegate research tasks to appropriate specialist personas
- Phase 2B: Planning. Delegate to the `planner` persona...
- Phase 2C: Realization. Delegate coding and implementation tasks...
- Phase 2D: Failure Recovery. If a child fails, reassess the plan, fix blockers, and retry or pivot.
- Phase 3: Completion & Verification. Delegate testing to a test-capable persona...
- Phase 4: Verification. Verify if the reports of the tester and results...
- Phase 5: Finalization. Update documentation, clean up `todo` list...
```

**Alignment with OMO:** ✅ Matches OMO's Sisyphus pipeline (Phase 0 intent gate, Phase 1 assessment, Phase 2 exploration/planning/implementation, Phase 3 verification)

---

### 3. Dynamic Prompt Rendering ⚠️

**Status:** PARTIALLY IMPLEMENTED

**Location:** `src/rotaris_core/agents/prompt_render.py` (191 lines)

**Evidence:**
```python
_TOKEN_RE = re.compile(r"\[\[ROTARIS:([A-Z_]+)\]\]")

TOOL_HINTS: dict[str, str] = {
    "haet": "Alias of `haet_edit`; modify source files with hash-anchored precision edits.",
    "file_editor": "Read and edit source files...",
    # ... 20+ tool hints
}

def render_system_prompt(template: str, ctx: PromptRenderContext) -> str:
    """Replace ``[[ROTARIS:…]]`` tokens in *template* using *ctx*."""
    replacements: dict[str, str] = {
        "PERSONA_NAME": ctx.persona_name,
        "TOOL_NAMES": _format_names(ctx.tools),
        "TOOLS_SECTION": _format_tools_section(ctx.tools),
        "DELEGATE_NAMES": _format_names(ctx.delegates_to),
        "DELEGATES_SECTION": _format_delegates_section(ctx.delegates_to),
        "MCP_NAMES": _format_names(ctx.mcp_servers),
        "DELEGATION_STRATEGY": _DELEGATION_STRATEGY,
    }
```

**Supported Tokens:**
- `[[ROTARIS:PERSONA_NAME]]` ✅
- `[[ROTARIS:TOOL_NAMES]]` ✅
- `[[ROTARIS:TOOLS_SECTION]]` ✅
- `[[ROTARIS:DELEGATE_NAMES]]` ✅
- `[[ROTARIS:DELEGATES_SECTION]]` ✅
- `[[ROTARIS:MCP_NAMES]]` ✅
- `[[ROTARIS:DELEGATION_STRATEGY]]` ✅

**Alignment with OMO:** ⚠️ **Partial**
- OMO uses dynamic builders: `buildAgentIdentitySection`, `buildToolSelectionTable`, `buildDelegationTable`, `buildOracleSection`, `buildHardBlocksSection`, `buildAntiPatternsSection`, `buildCategorySkillsDelegationGuide`
- Rotaris uses static token replacement with pre-built sections
- **Gap:** No dynamic generation of hard blocks, anti-patterns, or category-specific skill guidance

---

### 4. Model-Family-Specific Variants ⚠️

**Status:** INFRASTRUCTURE READY, NOT ACTIVELY USED

**Location:** 
- Config schema: `src/rotaris_core/config/schema.py` (PersonaConfig.model_family_variants)
- Factory: `src/rotaris_core/agents/factory.py` (lines 581-593)

**Evidence:**
```python
def _inject_model_family_variant(
    prompt: str,
    persona: PersonaConfig,
    model_name: str,
) -> str:
    """Append model-family-specific guidance if configured."""
    if not persona.model_family_variants:
        return prompt
    model_lower = model_name.lower()
    for family_prefix, variant_text in persona.model_family_variants.items():
        if model_lower.startswith(family_prefix.lower()):
            return f"{prompt}\n\n{variant_text}" if prompt else variant_text
    return prompt
```

**Alignment with OMO:** ⚠️ **Partial**
- OMO has model-specific prompt variants for Claude, GPT, Gemini (e.g., `sisyphus/default.ts`, `sisyphus/gpt-5-4.ts`, `sisyphus/gemini.ts`)
- Rotaris has the infrastructure but **no actual model-specific variants defined in prompts**
- **Gap:** Prompts don't leverage this feature; no Claude-specific, GPT-specific, or Gemini-specific guidance

---

### 5. Circuit Breaker Supervision ✅

**Status:** IMPLEMENTED

**Location:** `src/rotaris_core/agents/circuit_breaker.py` (469 lines)

**Evidence:**
```python
class CircuitBreaker:
    async def classify(
        self,
        *,
        events: list[object],
        session_id: str,
        tool_call_count: int,
        message_count: int,
        trigger_mode: str,
    ) -> CircuitBreakerActivation:
        """Detect unproductive loops and inject corrective messages."""
```

**Alignment with OMO:** ✅ Similar to OMO's loop detection and corrective injection

---

### 6. Todo-Driven Workflow ✅

**Status:** IMPLEMENTED

**Location:** `src/rotaris_core/agents/prompts/orchestrator.md` (lines 59-70)

**Evidence:**
```markdown
# Todo-Driven Workflow
- You MUST create a `todo` list before starting any non-trivial or multi-step task.
- Use `todo(operation="add_phase", payload={"name": "...", "tasks": []})` for major milestones.
- Use `todo(operation="add_task", payload={"phase_id": "...", "task": {...}})` for atomic steps.
- Use `todo(operation="update", payload={"task_id": "...", "status": "IN_PROGRESS"})` before delegating...
```

**Alignment with OMO:** ✅ Matches OMO's todo-anchored execution

---

### 7. Delegation Strategy ✅

**Status:** IMPLEMENTED

**Location:** `src/rotaris_core/agents/prompt_render.py` (lines 121-160)

**Evidence:**
```python
_DELEGATION_STRATEGY = """\
## Delegation strategy

Use the three-tool delegation workflow to fan out work to specialist personas.

### Tools overview
- `delegate` — spawn a child task. Returns a `task_id` immediately (non-blocking by default).
- `background_output(task_id)` — retrieve the full report of a completed background task.
- `wait_for_tasks(task_ids)` — voluntarily block until specific tasks finish.

### Parallel execution (preferred for independent tasks)
Call `delegate` multiple times in the same response with `run_in_background=true` (the default).
...
```

**Alignment with OMO:** ✅ Matches OMO's delegation workflow (parallel, background, DAG dependencies)

---

### 8. Built-in Personas

**Status:** PARTIALLY IMPLEMENTED

**Current Personas (6):**
1. `orchestrator` ✅ (matches Sisyphus)
2. `architect` ✅ (matches Prometheus/Architect)
3. `backend-dev` / `coding_agent` ✅ (matches Hephaestus/backend-dev)
4. `tester` ✅ (matches Tester)
5. `docs_writer` ✅ (matches Docs-Writer)
6. `refactorer` ✅ (matches Refactorer)

**Additional Personas in OMO (11 total):**
- `librarian` ⚠️ (exists but minimal; OMO has 320 LOC prompt)
- `planner` ⚠️ (exists but minimal; OMO has 85 LOC Prometheus)
- `momus` ❌ (plan reviewer — NOT in Rotaris)
- `metis` ❌ (pre-planning — NOT in Rotaris)
- `hephaestus` ⚠️ (deep worker — partially via backend-dev)
- `sisyphus-junior` ❌ (category-spawned — NOT in Rotaris)
- `multimodal-looker` ❌ (vision/PDF — NOT in Rotaris)
- `explore` ❌ (codebase grep — NOT in Rotaris)

**Prompt Files:**
```
src/rotaris_core/agents/prompts/
├── orchestrator.md       (88 lines) — Intent gate, phases, todo workflow
├── architect.md          (1,133 bytes) — Minimal
├── coding_agent.md       (2,311 bytes) — Implementation guidance
├── librarian.md          (30 lines) — Search and report
├── planner.md            (47 lines) — Plan synthesis
├── tester.md             (1,048 bytes) — Test execution
├── docs_writer.md        (984 bytes) — Documentation
└── refactorer.md         (982 bytes) — Code cleanup
```

**Alignment with OMO:** ⚠️ **Partial**
- Core personas exist but prompts are much shorter than OMO equivalents
- Missing specialized personas (Momus, Metis, Sisyphus-Junior, Multimodal-Looker, Explore)

---

### 9. Tool Restrictions ❌

**Status:** NOT IMPLEMENTED

**OMO Pattern:** Different agents have different permissions
- Read-only consultants: Oracle, Librarian, Explore, Multimodal-Looker
- Write-capable orchestrators: Sisyphus, Hephaestus, Atlas
- Specialized: Metis (pre-planning), Momus (review), Prometheus (planning)

**Rotaris Status:** All personas have access to the same tool set; no role-based restrictions

**Gap:** No mechanism to restrict file_editor, shell, or git_commit to specific personas

---

### 10. Skill System (3-Tier MCPs) ❌

**Status:** NOT IMPLEMENTED

**OMO Pattern:**
- **Built-in MCPs:** websearch, context7, grep_app (always available)
- **Claude Code MCPs:** env expansion, file operations (conditional)
- **Skill-embedded MCPs:** Scoped, on-demand, loaded per skill

**Rotaris Status:** MCP servers are configured globally per persona; no skill-based scoping

**Gap:** No mechanism for skill-specific MCP injection or conditional MCP loading

---

### 11. Hard Blocks & Anti-Patterns ❌

**Status:** NOT IMPLEMENTED

**OMO Pattern:** Sisyphus prompt includes explicit hard blocks:
- NEVER start implementing without explicit request
- NEVER duplicate code
- NEVER invent new patterns
- NEVER work alone (always delegate)

**Rotaris Status:** Orchestrator prompt has delegation rules but no explicit hard blocks section

**Gap:** No dedicated hard blocks or anti-patterns enforcement in prompts

---

### 12. Ultrawork Mode ❌

**Status:** NOT IMPLEMENTED

**OMO Pattern:** Command `ultrawork` or `ulw` fires all agents in parallel until 100% complete

**Rotaris Status:** Ralph loop exists but no ultrawork mode

**Gap:** No mechanism to spawn all available agents in parallel

---

## Summary Table

| Pattern | Status | Location | OMO Equivalent | Gap |
|---------|--------|----------|----------------|-----|
| Intent Classification Gate | ✅ | orchestrator.md:32-44 | Sisyphus Phase 0 | None |
| Phase-Driven Pipeline | ✅ | orchestrator.md:10-30 | Sisyphus phases | None |
| Dynamic Prompt Rendering | ⚠️ | prompt_render.py | Dynamic builders | No hard blocks, anti-patterns, category skills |
| Model-Family Variants | ⚠️ | factory.py:581-593 | Model-specific prompts | No actual variants defined |
| Circuit Breaker | ✅ | circuit_breaker.py | Loop detection | None |
| Todo-Driven Workflow | ✅ | orchestrator.md:59-70 | Todo anchoring | None |
| Delegation Strategy | ✅ | prompt_render.py:121-160 | Parallel delegation | None |
| Built-in Personas | ⚠️ | prompts/ | 11 agents | Missing 5 specialized personas |
| Tool Restrictions | ❌ | N/A | Role-based permissions | Not implemented |
| Skill System | ❌ | N/A | 3-tier MCPs | Not implemented |
| Hard Blocks | ❌ | N/A | Explicit rules | Not implemented |
| Ultrawork Mode | ❌ | N/A | Parallel all-agents | Not implemented |

---

## Recommendations for Next Steps

### High Priority (Blocking Quality)
1. **Enhance orchestrator prompt** with hard blocks and anti-patterns section
2. **Add model-specific variants** to key personas (Claude, GPT, Gemini guidance)
3. **Implement Momus persona** (plan reviewer) — critical for quality gates
4. **Implement Metis persona** (pre-planning) — critical for intent analysis

### Medium Priority (Feature Parity)
5. Implement tool restrictions (read-only vs. write-capable personas)
6. Add specialized personas (Explore, Multimodal-Looker, Sisyphus-Junior)
7. Enhance prompt rendering with category-specific skill guidance

### Low Priority (Nice-to-Have)
8. Implement skill system (3-tier MCP scoping)
9. Add ultrawork mode
10. Expand persona prompts to match OMO verbosity

---

## Files Reviewed

- `src/rotaris_core/agents/factory.py` (701 lines)
- `src/rotaris_core/agents/registry.py` (48 lines)
- `src/rotaris_core/agents/prompt_render.py` (191 lines)
- `src/rotaris_core/agents/circuit_breaker.py` (469 lines, partial)
- `src/rotaris_core/agents/prompts/orchestrator.md` (88 lines)
- `src/rotaris_core/agents/prompts/librarian.md` (30 lines)
- `src/rotaris_core/agents/prompts/planner.md` (47 lines)
- `src/rotaris_core/config/schema.py` (PersonaConfig definition)

