# Gap Analysis: OMO Patterns vs. Rotaris Implementation

**Date:** 2026-04-16  
**Purpose:** Document specific gaps in intent gate, dynamic prompts, delegation, and model variants

---

## Executive Summary

| Gap Category | Severity | Impact | Effort |
|--------------|----------|--------|--------|
| Intent Classification | ✅ None | N/A | N/A |
| Phase-Driven Pipeline | ✅ None | N/A | N/A |
| Hard Blocks & Anti-Patterns | 🔴 High | Quality degradation | Low |
| Model-Specific Variants | 🔴 High | Suboptimal model usage | Medium |
| Dynamic Prompt Generation | 🟡 Medium | Limited flexibility | Medium |
| Tool Restrictions | 🟡 Medium | Security/quality risk | High |
| Specialized Personas | 🟡 Medium | Feature gaps | High |
| Delegation Strategy | ✅ None | N/A | N/A |

---

## 1. Intent Classification Gate

**Status:** ✅ FULLY IMPLEMENTED

**Current Implementation:**
- Location: `src/rotaris_core/agents/prompts/orchestrator.md` (lines 32-44)
- 5 categories: Trivial, Explicit, Exploratory, Open-ended, Ambiguous
- User-visible format requirement: `Intent: <category> - <brief plan>`
- Ambiguous requests trigger single clarifying question

**Alignment with OMO:** ✅ Perfect match

**Gap:** None

---

## 2. Phase-Driven Execution Pipeline

**Status:** ✅ FULLY IMPLEMENTED

**Current Implementation:**
- Location: `src/rotaris_core/agents/prompts/orchestrator.md` (lines 10-30)
- 6 phases: Intent Classification, Assessment, Exploration, Planning, Realization, Verification, Finalization
- Entry conditions and expected outputs documented
- Phase transitions explicit

**Alignment with OMO:** ✅ Perfect match

**Gap:** None

---

## 3. Hard Blocks & Anti-Patterns

**Status:** 🔴 MISSING

**OMO Implementation:**
```
Hard Blocks (Sisyphus.ts):
- NEVER start implementing without explicit request
- NEVER duplicate code
- NEVER invent new patterns
- NEVER work alone (always delegate)

Anti-Patterns:
- Avoid unsolicited status updates
- Avoid filler and flattery
- Avoid mid-task context injection
- Avoid plan-only responses
```

**Rotaris Current State:**
- Orchestrator prompt has delegation rules but no explicit hard blocks section
- No dedicated anti-patterns enforcement
- Communication style rules exist but scattered

**Gap Analysis:**
- **Missing:** Explicit hard blocks section in orchestrator prompt
- **Missing:** Anti-patterns enforcement
- **Missing:** Consolidated communication style rules
- **Impact:** Agents may violate core constraints (e.g., start implementing without request)
- **Severity:** 🔴 High — affects quality and safety

**Recommendation:**
Add to orchestrator.md:
```markdown
# Hard Blocks (NEVER)
- NEVER start implementing without explicit user request
- NEVER duplicate existing code or patterns
- NEVER invent new architectural patterns
- NEVER work alone — always delegate to specialists
- NEVER skip the intent classification gate
- NEVER proceed to implementation without a todo list for multi-step work

# Anti-Patterns (AVOID)
- Unsolicited mid-task status updates ("I'm now doing X...")
- Filler and flattery ("I'd be happy to help...")
- Ungrounded speculation without evidence
- Plan-only responses (announce intent without execution)
- Asking for permission for routine decisions
- Verbose explanations when concise is sufficient
```

**Effort:** Low (1-2 hours)

---

## 4. Model-Specific Variants

**Status:** 🔴 INFRASTRUCTURE READY, NOT USED

**OMO Implementation:**
- Sisyphus has variants: `default.ts`, `gpt-5-4.ts`, `gemini.ts`
- Hephaestus has variants: `default.ts`, `gpt-5-4.ts`, `gpt-5-3-codex.ts`, `gpt.ts`
- Prometheus has variants: `default.ts`, `gpt.ts`, `gemini.ts`
- Each variant includes model-family-specific guidance

**Rotaris Current State:**
- Config schema supports `model_family_variants` (PersonaConfig)
- Factory injects variants via `_inject_model_family_variant()` (factory.py:581-593)
- **No actual variants defined in any persona prompts**

**Gap Analysis:**
- **Missing:** Claude-specific guidance in prompts
- **Missing:** GPT-specific guidance in prompts
- **Missing:** Gemini-specific guidance in prompts
- **Missing:** Model-specific tool usage patterns
- **Missing:** Model-specific reasoning styles
- **Impact:** Agents don't leverage model strengths; suboptimal performance
- **Severity:** 🔴 High — affects output quality

**Example OMO Pattern (Sisyphus GPT variant):**
```
For GPT-5-4 models:
- Use structured reasoning with explicit step-by-step thinking
- Leverage function calling for tool invocation
- Prefer JSON-formatted outputs for structured data
- Use explicit role-playing for persona adoption
```

**Recommendation:**
1. Create model-specific variant sections in key personas:
   - `orchestrator.md` → add `model_family_variants` in config
   - `coding_agent.md` → add GPT autonomy guidance
   - `planner.md` → add Claude planning guidance
   - `librarian.md` → add search strategy variants

2. Example config structure:
```yaml
personas:
  orchestrator:
    model: gpt-4o
    system_prompt_file: prompts/orchestrator.md
    model_family_variants:
      gpt:
        - Use structured reasoning with explicit step-by-step thinking
        - Leverage function calling for tool invocation
        - Prefer JSON-formatted outputs for structured data
      claude:
        - Use natural language reasoning with implicit step-by-step thinking
        - Prefer XML-formatted outputs for structured data
        - Leverage extended context window for comprehensive analysis
      gemini:
        - Use multimodal reasoning when applicable
        - Leverage real-time information access
        - Prefer concise, direct responses
```

**Effort:** Medium (4-6 hours)

---

## 5. Dynamic Prompt Generation

**Status:** 🟡 PARTIALLY IMPLEMENTED

**OMO Implementation:**
- Dynamic builders: `buildAgentIdentitySection`, `buildToolSelectionTable`, `buildDelegationTable`, `buildOracleSection`, `buildHardBlocksSection`, `buildAntiPatternsSection`, `buildCategorySkillsDelegationGuide`
- Prompts generated at runtime based on available agents, tools, skills, categories, model type
- 30 LOC core builder (dynamic-agent-prompt-builder.ts)

**Rotaris Current State:**
- Static token replacement system (prompt_render.py)
- 7 supported tokens: PERSONA_NAME, TOOL_NAMES, TOOLS_SECTION, DELEGATE_NAMES, DELEGATES_SECTION, MCP_NAMES, DELEGATION_STRATEGY
- Pre-built sections (TOOL_HINTS, _DELEGATION_STRATEGY)
- No dynamic generation of hard blocks, anti-patterns, or category skills

**Gap Analysis:**
- **Missing:** Dynamic hard blocks generation
- **Missing:** Dynamic anti-patterns generation
- **Missing:** Dynamic category-specific skill guidance
- **Missing:** Dynamic tool selection table
- **Missing:** Dynamic delegation table
- **Missing:** Model-aware prompt generation
- **Impact:** Limited flexibility; prompts can't adapt to runtime conditions
- **Severity:** 🟡 Medium — affects flexibility but not core functionality

**Current Tokens:**
```python
TOOL_HINTS: dict[str, str] = {
    "haet": "...",
    "file_editor": "...",
    "shell": "...",
    "git_commit": "...",
    # ... 20+ tools
}

_DELEGATION_STRATEGY = """..."""  # 40 lines
```

**Recommendation:**
Extend prompt_render.py with dynamic builders:
```python
def build_hard_blocks_section(persona_name: str) -> str:
    """Generate hard blocks for persona."""
    if persona_name == "orchestrator":
        return """# Hard Blocks (NEVER)
- NEVER start implementing without explicit request
- NEVER duplicate code
- NEVER invent patterns
- NEVER work alone"""
    return ""

def build_anti_patterns_section(persona_name: str) -> str:
    """Generate anti-patterns for persona."""
    if persona_name == "orchestrator":
        return """# Anti-Patterns (AVOID)
- Unsolicited status updates
- Filler and flattery
- Ungrounded speculation
- Plan-only responses"""
    return ""

def build_category_skills_guide(persona_name: str, categories: list[str]) -> str:
    """Generate category-specific skill guidance."""
    # Map categories to skill guidance
    pass
```

**Effort:** Medium (4-6 hours)

---

## 6. Tool Restrictions

**Status:** 🔴 NOT IMPLEMENTED

**OMO Implementation:**
- Read-only consultants: Oracle, Librarian, Explore, Multimodal-Looker
  - Tools: grep, glob, find, fetch, haet_read (no write)
- Write-capable orchestrators: Sisyphus, Hephaestus, Atlas
  - Tools: file_editor, shell, git_commit, delegate
- Specialized: Metis (pre-planning), Momus (review), Prometheus (planning)
  - Tools: grep, glob, find, fetch, delegate (no write)

**Rotaris Current State:**
- All personas have access to same tool set
- No role-based tool restrictions
- No mechanism to restrict file_editor, shell, or git_commit

**Gap Analysis:**
- **Missing:** Read-only tool restrictions
- **Missing:** Role-based tool assignment
- **Missing:** Tool permission enforcement
- **Impact:** Consultants could accidentally modify files; quality risk
- **Severity:** 🔴 High — affects safety and quality

**Recommendation:**
1. Add tool restriction mechanism to PersonaConfig:
```python
class PersonaConfig(BaseModel):
    name: str
    tools: list[str]
    tool_restrictions: dict[str, list[str]] | None = None  # tool -> allowed_personas
    read_only: bool = False  # If True, restrict to read-only tools
```

2. Implement restriction enforcement in factory.py:
```python
def _apply_tool_restrictions(persona: PersonaConfig, tools: list[str]) -> list[str]:
    """Filter tools based on persona restrictions."""
    if persona.read_only:
        read_only_tools = {"grep", "glob", "find", "fetch", "haet_read"}
        return [t for t in tools if t in read_only_tools]
    return tools
```

3. Define personas with restrictions:
```yaml
personas:
  oracle:
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  librarian:
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  orchestrator:
    read_only: false
    tools: [delegate, shell, todo, git_commit, fetch, file_editor]
```

**Effort:** High (8-12 hours)

---

## 7. Specialized Personas

**Status:** 🟡 PARTIALLY MISSING

**OMO Personas (11 total):**
- ✅ Sisyphus (orchestrator)
- ✅ Hephaestus (backend-dev)
- ❌ Oracle (read-only consultant)
- ⚠️ Librarian (minimal)
- ❌ Explore (codebase specialist)
- ❌ Metis (pre-planning)
- ❌ Momus (plan reviewer)
- ⚠️ Prometheus (planner, minimal)
- ❌ Atlas (todo manager)
- ❌ Multimodal-Looker (vision)
- ❌ Sisyphus-Junior (category-spawned)

**Rotaris Personas (6 total):**
- ✅ orchestrator
- ✅ backend-dev / coding_agent
- ✅ architect
- ⚠️ planner (minimal)
- ⚠️ librarian (minimal)
- ✅ tester
- ✅ docs_writer
- ✅ refactorer

**Gap Analysis:**
- **Missing:** Oracle (read-only pragmatist)
- **Missing:** Explore (codebase specialist)
- **Missing:** Metis (pre-planning)
- **Missing:** Momus (plan reviewer)
- **Missing:** Atlas (todo manager)
- **Missing:** Multimodal-Looker (vision)
- **Missing:** Sisyphus-Junior (category-spawned)
- **Minimal:** Librarian (30 lines vs 320 LOC)
- **Minimal:** Planner (47 lines vs 85 LOC)
- **Impact:** Missing quality gates (Momus), pre-planning (Metis), specialized search (Explore)
- **Severity:** 🟡 Medium — affects feature completeness

**Priority Implementation Order:**
1. **Momus** (plan reviewer) — Critical quality gate
2. **Metis** (pre-planning) — Critical scope clarity
3. **Oracle** (read-only consultant) — Pragmatic analysis
4. **Explore** (codebase specialist) — Specialized search
5. **Enhance Librarian** — Add classification system
6. **Enhance Planner** — Add interview-mode

**Effort:** High (20-30 hours for all 6)

---

## 8. Delegation Strategy

**Status:** ✅ FULLY IMPLEMENTED

**Current Implementation:**
- Location: `src/rotaris_core/agents/prompt_render.py` (lines 121-160)
- 3-tool workflow: delegate, background_output, wait_for_tasks
- Parallel execution (default)
- Sequential execution (when needed)
- DAG pipelines with depends_on
- Background task notifications

**Alignment with OMO:** ✅ Perfect match

**Gap:** None

---

## Summary Table

| Gap | Severity | Status | Effort | Priority |
|-----|----------|--------|--------|----------|
| Hard Blocks & Anti-Patterns | 🔴 High | Missing | Low | 1 |
| Model-Specific Variants | 🔴 High | Infrastructure only | Medium | 2 |
| Tool Restrictions | 🔴 High | Missing | High | 3 |
| Specialized Personas (Momus, Metis) | 🟡 Medium | Missing | High | 4 |
| Dynamic Prompt Generation | 🟡 Medium | Partial | Medium | 5 |
| Specialized Personas (Oracle, Explore) | 🟡 Medium | Missing | High | 6 |
| Librarian Enhancement | 🟡 Medium | Minimal | Medium | 7 |
| Planner Enhancement | 🟡 Medium | Minimal | Medium | 8 |

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)
1. Add hard blocks section to orchestrator.md
2. Add anti-patterns section to orchestrator.md
3. Consolidate communication style rules

### Phase 2: Model Variants (2-3 days)
4. Define model-specific variants for orchestrator
5. Define model-specific variants for coding_agent
6. Define model-specific variants for planner
7. Test variant injection

### Phase 3: Tool Restrictions (3-4 days)
8. Implement tool restriction mechanism
9. Create Oracle persona (read-only)
10. Create Explore persona (read-only)
11. Update existing personas with restrictions

### Phase 4: Specialized Personas (5-7 days)
12. Create Momus persona (plan reviewer)
13. Create Metis persona (pre-planning)
14. Enhance Librarian prompt
15. Enhance Planner prompt

### Phase 5: Dynamic Generation (3-4 days)
16. Extend prompt_render.py with dynamic builders
17. Add hard blocks generation
18. Add anti-patterns generation
19. Add category skills guidance

---

## Files to Modify

### High Priority
- `src/rotaris_core/agents/prompts/orchestrator.md` — Add hard blocks, anti-patterns
- `src/rotaris_core/agents/factory.py` — Implement tool restrictions
- `src/rotaris_core/config/schema.py` — Add tool_restrictions field

### Medium Priority
- `src/rotaris_core/agents/prompt_render.py` — Extend with dynamic builders
- `src/rotaris_core/agents/prompts/coding_agent.md` — Add model variants
- `src/rotaris_core/agents/prompts/planner.md` — Add interview-mode

### New Files
- `src/rotaris_core/agents/prompts/oracle.md` — New persona
- `src/rotaris_core/agents/prompts/explore.md` — New persona
- `src/rotaris_core/agents/prompts/momus.md` — New persona
- `src/rotaris_core/agents/prompts/metis.md` — New persona

