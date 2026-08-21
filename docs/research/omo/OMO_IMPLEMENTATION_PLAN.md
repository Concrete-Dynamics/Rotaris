# Implementation Plan: OMO Pattern Adaptation for Rotaris

**Date:** 2026-04-16  
**Scope:** Adapt OMO's proven patterns into Rotaris  
**Total Effort:** ~40-50 hours  
**Timeline:** 5-7 days (full-time)

---

## Overview

This plan prioritizes high-impact, low-effort changes first, then moves to feature completeness.

### Effort Breakdown
- **Phase 1 (Quick Wins):** 2-3 hours
- **Phase 2 (Model Variants):** 4-6 hours
- **Phase 3 (Tool Restrictions):** 8-12 hours
- **Phase 4 (Specialized Personas):** 20-30 hours
- **Phase 5 (Dynamic Generation):** 3-4 hours

---

## Phase 1: Quick Wins (1 day)

### 1.1 Add Hard Blocks Section to Orchestrator

**File:** `src/rotaris_core/agents/prompts/orchestrator.md`

**Changes:**
- Add "Hard Blocks (NEVER)" section after "Intent Classification Gate"
- Add "Anti-Patterns (AVOID)" section after "Communication Style"
- Consolidate communication style rules

**Implementation:**
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

**Effort:** 1 hour  
**Impact:** High (prevents common mistakes)  
**Testing:** Manual verification in TUI

---

### 1.2 Consolidate Communication Style Rules

**File:** `src/rotaris_core/agents/prompts/orchestrator.md`

**Changes:**
- Move scattered communication rules into unified section
- Add explicit examples of good vs. bad responses

**Implementation:**
```markdown
# Communication Style
- No flattery, filler, or "I'd be happy to help" slop.
- Always say what you are about to do before you do it (e.g., "I'm going to delegate X to Y now.").
- Provide concise final responses summarizing what was achieved.
- Direct pushback: If a user's assumption is technically incorrect or risky, say so clearly.
- Final responses must describe completed work, not merely announced intent. Never present a
  plan-only preamble as if the task were finished.

## Examples

### ✅ Good Response
"Intent: Open-ended - I'll assess the codebase, plan the refactoring, and delegate implementation.

I'm delegating to the architect to review the current structure..."

### ❌ Bad Response
"I'd be happy to help you refactor this code! Let me start by exploring the codebase to understand the current structure. I'm now reading the files..."
```

**Effort:** 0.5 hours  
**Impact:** Medium (improves response quality)  
**Testing:** Manual verification

---

### 1.3 Update Requirement Log

**File:** `docs/requirement-log/unresolved/requirements-YYYYMMDD-HHMMSS.md`

**Changes:**
- Create new requirement log entry
- Document Phase 1 completion

**Effort:** 0.5 hours

---

**Phase 1 Total:** 2 hours

---

## Phase 2: Model-Specific Variants (2-3 days)

### 2.1 Define Model Variants for Orchestrator

**File:** `src/rotaris_core/agents/prompts/orchestrator.md`

**Changes:**
- Add model-specific guidance sections
- Create config entries for model_family_variants

**Implementation:**
```markdown
## Model-Specific Guidance

### For GPT Models (GPT-4, GPT-5)
- Use structured reasoning with explicit step-by-step thinking
- Leverage function calling for tool invocation
- Prefer JSON-formatted outputs for structured data
- Use explicit role-playing for persona adoption
- Break complex decisions into numbered steps

### For Claude Models (Claude 3.x, Claude 4)
- Use natural language reasoning with implicit step-by-step thinking
- Prefer XML-formatted outputs for structured data
- Leverage extended context window for comprehensive analysis
- Use conversational tone for internal reasoning
- Assume reader understands implicit context

### For Gemini Models
- Use multimodal reasoning when applicable
- Leverage real-time information access
- Prefer concise, direct responses
- Use structured formats for complex data
- Optimize for latency
```

**Config Entry:**
```yaml
personas:
  orchestrator:
    model: gpt-4o
    system_prompt_file: prompts/orchestrator.md
    model_family_variants:
      gpt: |
        ## GPT-Specific Guidance
        - Use structured reasoning with explicit step-by-step thinking
        - Leverage function calling for tool invocation
        - Prefer JSON-formatted outputs for structured data
      claude: |
        ## Claude-Specific Guidance
        - Use natural language reasoning with implicit step-by-step thinking
        - Prefer XML-formatted outputs for structured data
        - Leverage extended context window for comprehensive analysis
      gemini: |
        ## Gemini-Specific Guidance
        - Use multimodal reasoning when applicable
        - Leverage real-time information access
        - Prefer concise, direct responses
```

**Effort:** 1.5 hours  
**Impact:** High (optimizes for model strengths)  
**Testing:** Test with different models

---

### 2.2 Define Model Variants for Coding Agent

**File:** `src/rotaris_core/agents/prompts/coding_agent.md`

**Changes:**
- Add GPT-specific autonomy guidance
- Add Claude-specific structured thinking guidance

**Implementation:**
```markdown
## Model-Specific Autonomy

### For GPT Models
- Make autonomous decisions without asking for permission
- Use function calling to invoke tools directly
- Prefer explicit step-by-step reasoning
- Break complex tasks into numbered steps
- Validate assumptions before proceeding

### For Claude Models
- Make autonomous decisions with implicit reasoning
- Use natural language for tool invocation
- Prefer conversational reasoning style
- Assume context is understood
- Validate assumptions through exploration
```

**Effort:** 1 hour  
**Impact:** High (improves implementation quality)  
**Testing:** Test with different models

---

### 2.3 Define Model Variants for Planner

**File:** `src/rotaris_core/agents/prompts/planner.md`

**Changes:**
- Add Claude-specific planning guidance
- Add GPT-specific structured planning guidance

**Implementation:**
```markdown
## Model-Specific Planning

### For Claude Models
- Use natural language planning with implicit structure
- Leverage extended context for comprehensive analysis
- Prefer conversational tone for reasoning
- Use implicit task dependencies

### For GPT Models
- Use structured planning with explicit numbering
- Break tasks into numbered steps
- Use explicit dependency declarations
- Prefer JSON-formatted task lists
```

**Effort:** 1 hour  
**Impact:** Medium (improves plan quality)  
**Testing:** Test with different models

---

### 2.4 Test Model Variant Injection

**File:** `tests/unit/test_model_variants.py` (new)

**Changes:**
- Create unit tests for variant injection
- Test with mock personas and models

**Implementation:**
```python
def test_inject_model_family_variant_gpt():
    """Test GPT variant injection."""
    persona = PersonaConfig(
        name="orchestrator",
        model="gpt-4o",
        model_family_variants={
            "gpt": "GPT-specific guidance",
            "claude": "Claude-specific guidance",
        }
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "gpt-4o")
    assert "GPT-specific guidance" in result

def test_inject_model_family_variant_claude():
    """Test Claude variant injection."""
    persona = PersonaConfig(
        name="orchestrator",
        model="claude-3-sonnet",
        model_family_variants={
            "gpt": "GPT-specific guidance",
            "claude": "Claude-specific guidance",
        }
    )
    prompt = "Base prompt"
    result = _inject_model_family_variant(prompt, persona, "claude-3-sonnet")
    assert "Claude-specific guidance" in result
```

**Effort:** 1 hour  
**Impact:** Medium (ensures correctness)  
**Testing:** Run pytest

---

**Phase 2 Total:** 4.5 hours

---

## Phase 3: Tool Restrictions (3-4 days)

### 3.1 Add Tool Restriction Schema

**File:** `src/rotaris_core/config/schema.py`

**Changes:**
- Add `read_only` field to PersonaConfig
- Add `tool_restrictions` field to PersonaConfig

**Implementation:**
```python
class PersonaConfig(BaseModel):
    name: str
    model: str
    system_prompt: str | None = None
    system_prompt_file: str | None = None
    tools: list[str] = Field(default_factory=list)
    delegates_to: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    custom_tools: list[str] = Field(default_factory=list)
    model_family_variants: dict[str, str] | None = None
    
    # NEW FIELDS
    read_only: bool = False  # If True, restrict to read-only tools
    tool_restrictions: dict[str, list[str]] | None = None  # tool -> allowed_personas
```

**Effort:** 0.5 hours  
**Impact:** High (enables restrictions)  
**Testing:** Unit tests for schema validation

---

### 3.2 Implement Tool Restriction Enforcement

**File:** `src/rotaris_core/agents/factory.py`

**Changes:**
- Add `_apply_tool_restrictions()` function
- Call restriction function in `create_agent_for_persona()`

**Implementation:**
```python
def _apply_tool_restrictions(persona: PersonaConfig, tools: list[str]) -> list[str]:
    """Filter tools based on persona restrictions."""
    if persona.read_only:
        read_only_tools = {"grep", "glob", "find", "fetch", "haet_read"}
        filtered = [t for t in tools if t in read_only_tools]
        if len(filtered) < len(tools):
            _log.warning(
                "Persona '%s' is read-only; removing write tools: %s",
                persona.name,
                set(tools) - set(filtered),
            )
        return filtered
    
    if persona.tool_restrictions:
        filtered = [t for t in tools if t in persona.tool_restrictions.get(persona.name, tools)]
        if len(filtered) < len(tools):
            _log.warning(
                "Persona '%s' has tool restrictions; removing: %s",
                persona.name,
                set(tools) - set(filtered),
            )
        return filtered
    
    return tools

def create_agent_for_persona(...) -> Callable[[LLM], Agent]:
    def factory(llm: LLM) -> Agent:
        # ... existing code ...
        
        # Apply tool restrictions
        persona.tools = _apply_tool_restrictions(persona, persona.tools)
        
        # ... rest of code ...
```

**Effort:** 1 hour  
**Impact:** High (enforces restrictions)  
**Testing:** Unit tests for restriction logic

---

### 3.3 Create Oracle Persona

**File:** `src/rotaris_core/agents/prompts/oracle.md` (new)

**Changes:**
- Create new oracle.md prompt
- Define as read-only consultant

**Implementation:**
```markdown
You are the [[ROTARIS:PERSONA_NAME]] persona for Rotaris.

Your single purpose is to provide pragmatic, minimal analysis of code and systems.
You are a read-only consultant — you never modify files or execute commands.

# Available Tools
[[ROTARIS:TOOLS_SECTION]]

# Out-of-Scope Actions
- Do not create, edit, or delete any files.
- Do not execute shell commands.
- Do not delegate work to other agents.
- Do not make implementation decisions.

# Response Structure

Use a 3-tier response structure:

1. **Essential**: The core answer (1-2 sentences)
2. **Expanded**: Additional context if relevant (2-3 sentences)
3. **Edge Cases**: Caveats or special considerations (1-2 sentences)

# Communication Style
- Be concise and pragmatic.
- Avoid speculation or assumptions.
- Provide evidence-based analysis only.
- Use minimal verbosity.
```

**Effort:** 1 hour  
**Impact:** Medium (adds read-only consultant)  
**Testing:** Manual verification in TUI

---

### 3.4 Create Explore Persona

**File:** `src/rotaris_core/agents/prompts/explore.md` (new)

**Changes:**
- Create new explore.md prompt
- Define as codebase specialist

**Implementation:**
```markdown
You are the [[ROTARIS:PERSONA_NAME]] persona for Rotaris.

Your single purpose is to explore the codebase and discover patterns, symbols, and code structures.
You are a read-only specialist — you never modify files or execute commands.

# Available Tools
[[ROTARIS:TOOLS_SECTION]]

# Out-of-Scope Actions
- Do not create, edit, or delete any files.
- Do not execute shell commands.
- Do not delegate work to other agents.

# Exploration Strategy

1. Use `find` strategically to locate relevant files
2. Use `grep` to search for patterns and symbols
3. Use `glob` to discover file structures
4. Use `haet_read` to examine file contents
5. Report findings with file paths and line references

# Expected Output Format
- File paths with line references
- Code snippets in fenced blocks
- Pattern analysis
- Recommendations for next steps
```

**Effort:** 1 hour  
**Impact:** Medium (adds codebase specialist)  
**Testing:** Manual verification in TUI

---

### 3.5 Update Existing Personas with Restrictions

**File:** `src/rotaris_core/config/schema.py` (agents.yaml)

**Changes:**
- Add `read_only: true` to oracle and explore
- Add tool lists to all personas

**Implementation:**
```yaml
personas:
  oracle:
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  explore:
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  librarian:
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  orchestrator:
    read_only: false
    tools: [delegate, shell, todo, git_commit, fetch, file_editor]
  
  coding_agent:
    read_only: false
    tools: [file_editor, shell, git_commit, haet_edit, haet_read]
```

**Effort:** 1 hour  
**Impact:** High (enforces role-based access)  
**Testing:** Unit tests for restriction logic

---

### 3.6 Test Tool Restrictions

**File:** `tests/unit/test_tool_restrictions.py` (new)

**Changes:**
- Create unit tests for tool restriction logic
- Test read-only personas
- Test tool filtering

**Effort:** 1 hour  
**Impact:** Medium (ensures correctness)  
**Testing:** Run pytest

---

**Phase 3 Total:** 6 hours

---

## Phase 4: Specialized Personas (5-7 days)

### 4.1 Create Momus Persona (Plan Reviewer)

**File:** `src/rotaris_core/agents/prompts/momus.md` (new)

**Changes:**
- Create new momus.md prompt
- Define as plan reviewer with approval bias

**Implementation:**
```markdown
You are the [[ROTARIS:PERSONA_NAME]] persona for Rotaris.

Your single purpose is to review execution plans and identify blocking issues.
You assume plans are good unless you find blocking issues.

# Available Tools
[[ROTARIS:TOOLS_SECTION]]

# Review Protocol

1. Read the plan thoroughly
2. Identify blocking issues (issues that prevent execution)
3. Ignore minor improvements or nitpicks
4. Verify references and assumptions
5. Report findings

# Approval Bias

- Assume the plan is sound unless you find blocking issues
- Do not nitpick minor details
- Focus on feasibility and correctness
- Flag only issues that block execution

# Expected Output Format

1. **Approval Status**: Approved / Blocked
2. **Blocking Issues**: List of issues that prevent execution
3. **Verification**: References checked and assumptions verified
4. **Recommendations**: Suggested fixes for blocking issues
```

**Effort:** 2 hours  
**Impact:** High (critical quality gate)  
**Testing:** Manual verification in TUI

---

### 4.2 Create Metis Persona (Pre-Planning)

**File:** `src/rotaris_core/agents/prompts/metis.md` (new)

**Changes:**
- Create new metis.md prompt
- Define as pre-planning analyst

**Implementation:**
```markdown
You are the [[ROTARIS:PERSONA_NAME]] persona for Rotaris.

Your single purpose is to analyze requests before planning and identify scope, risks, and ambiguities.

# Available Tools
[[ROTARIS:TOOLS_SECTION]]

# Pre-Planning Analysis

1. Clarify the goal and scope
2. Identify assumptions and ambiguities
3. Assess risks and dependencies
4. Recommend approach
5. Flag open questions

# Expected Output Format

1. **Goal Summary**: What is being requested
2. **Scope Assessment**: What is in scope / out of scope
3. **Assumptions**: Explicit assumptions about the request
4. **Risks**: Potential risks or blockers
5. **Open Questions**: Ambiguities that need clarification
6. **Recommended Approach**: Suggested path forward
```

**Effort:** 2 hours  
**Impact:** High (critical scope clarity)  
**Testing:** Manual verification in TUI

---

### 4.3 Enhance Librarian Persona

**File:** `src/rotaris_core/agents/prompts/librarian.md`

**Changes:**
- Add TYPE A/B/C/D classification system
- Add documentation discovery protocol
- Add targeted investigation strategy

**Implementation:**
```markdown
# Request Classification

Classify requests into one of four types:

- **TYPE A (Conceptual)**: "How do I use X?", "What is best practice for Y?"
  → Use documentation discovery, context7, websearch
  
- **TYPE B (Implementation)**: "How does X implement Y?", "Show me source of Z"
  → Clone repo, read source, git blame
  
- **TYPE C (Context)**: "Why was this changed?", "History of X?"
  → Search issues/PRs, git log, git blame
  
- **TYPE D (Comprehensive)**: Complex/ambiguous requests
  → Use all tools in combination

# Documentation Discovery Protocol

1. Find official documentation URL
2. Check version (if specified)
3. Discover sitemap structure
4. Fetch targeted pages
5. Synthesize findings

# Targeted Investigation Strategy

1. Make use of tools strategically
2. Don't use `find` excessively
3. Stop searching once you have enough evidence
4. Report findings with evidence
```

**Effort:** 1.5 hours  
**Impact:** Medium (improves search quality)  
**Testing:** Manual verification in TUI

---

### 4.4 Enhance Planner Persona

**File:** `src/rotaris_core/agents/prompts/planner.md`

**Changes:**
- Add interview-mode protocol
- Add model-specific variants
- Add modular plan structure

**Implementation:**
```markdown
# Interview-Mode Protocol

When given a task with ambiguities:

1. Ask clarifying questions (one at a time)
2. Gather responses
3. Refine understanding
4. Produce structured plan

# Modular Plan Structure

Each task must specify:
- Task name (short, unique)
- Persona to assign
- Files to create or modify
- Acceptance criterion
- Dependencies

# Model-Specific Planning

### For Claude Models
- Use natural language planning
- Leverage extended context
- Prefer conversational reasoning

### For GPT Models
- Use structured planning with numbering
- Break tasks into explicit steps
- Use JSON-formatted task lists
```

**Effort:** 1.5 hours  
**Impact:** Medium (improves planning quality)  
**Testing:** Manual verification in TUI

---

### 4.5 Register New Personas

**File:** `src/rotaris_core/config/schema.py` (agents.yaml)

**Changes:**
- Add momus, metis, oracle, explore to default config
- Define tool sets and restrictions

**Implementation:**
```yaml
personas:
  momus:
    model: gpt-4o-mini
    system_prompt_file: prompts/momus.md
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  metis:
    model: gpt-4o-mini
    system_prompt_file: prompts/metis.md
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  oracle:
    model: gpt-4o-mini
    system_prompt_file: prompts/oracle.md
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
  
  explore:
    model: gpt-4o-mini
    system_prompt_file: prompts/explore.md
    read_only: true
    tools: [grep, glob, find, fetch, haet_read]
```

**Effort:** 0.5 hours  
**Impact:** High (enables new personas)  
**Testing:** Unit tests for persona registration

---

### 4.6 Test New Personas

**File:** `tests/integration/test_new_personas.py` (new)

**Changes:**
- Create integration tests for new personas
- Test persona initialization
- Test tool restrictions

**Effort:** 2 hours  
**Impact:** Medium (ensures correctness)  
**Testing:** Run pytest

---

**Phase 4 Total:** 11 hours

---

## Phase 5: Dynamic Prompt Generation (3-4 days)

### 5.1 Extend Prompt Renderer with Dynamic Builders

**File:** `src/rotaris_core/agents/prompt_render.py`

**Changes:**
- Add `build_hard_blocks_section()` function
- Add `build_anti_patterns_section()` function
- Add `build_category_skills_guide()` function
- Add new tokens to renderer

**Implementation:**
```python
def build_hard_blocks_section(persona_name: str) -> str:
    """Generate hard blocks for persona."""
    hard_blocks = {
        "orchestrator": """# Hard Blocks (NEVER)
- NEVER start implementing without explicit request
- NEVER duplicate code
- NEVER invent patterns
- NEVER work alone""",
        "coding_agent": """# Hard Blocks (NEVER)
- NEVER modify files without explicit request
- NEVER skip tests
- NEVER commit without verification""",
    }
    return hard_blocks.get(persona_name, "")

def build_anti_patterns_section(persona_name: str) -> str:
    """Generate anti-patterns for persona."""
    anti_patterns = {
        "orchestrator": """# Anti-Patterns (AVOID)
- Unsolicited status updates
- Filler and flattery
- Ungrounded speculation
- Plan-only responses""",
    }
    return anti_patterns.get(persona_name, "")

def build_category_skills_guide(persona_name: str, categories: list[str]) -> str:
    """Generate category-specific skill guidance."""
    # Map categories to skill guidance
    category_guides = {
        "quick": "Focus on speed and simplicity",
        "deep": "Focus on thoroughness and correctness",
        "planning": "Focus on structure and dependencies",
        "research": "Focus on evidence and documentation",
    }
    
    if not categories:
        return ""
    
    lines = ["# Category-Specific Guidance"]
    for category in categories:
        if category in category_guides:
            lines.append(f"- **{category}**: {category_guides[category]}")
    
    return "\n".join(lines)
```

**Effort:** 2 hours  
**Impact:** Medium (enables dynamic generation)  
**Testing:** Unit tests for builders

---

### 5.2 Add New Tokens to Renderer

**File:** `src/rotaris_core/agents/prompt_render.py`

**Changes:**
- Add `[[ROTARIS:HARD_BLOCKS]]` token
- Add `[[ROTARIS:ANTI_PATTERNS]]` token
- Add `[[ROTARIS:CATEGORY_SKILLS]]` token

**Implementation:**
```python
def render_system_prompt(template: str, ctx: PromptRenderContext) -> str:
    """Replace ``[[ROTARIS:…]]`` tokens in *template* using *ctx*."""
    if "[[ROTARIS:" not in template:
        return template
    
    replacements: dict[str, str] = {
        # ... existing replacements ...
        "HARD_BLOCKS": build_hard_blocks_section(ctx.persona_name),
        "ANTI_PATTERNS": build_anti_patterns_section(ctx.persona_name),
        "CATEGORY_SKILLS": build_category_skills_guide(ctx.persona_name, ctx.categories),
    }
    
    # ... rest of function ...
```

**Effort:** 1 hour  
**Impact:** Medium (enables new tokens)  
**Testing:** Unit tests for token replacement

---

### 5.3 Update Prompts to Use New Tokens

**File:** `src/rotaris_core/agents/prompts/orchestrator.md`

**Changes:**
- Replace hard-coded hard blocks with `[[ROTARIS:HARD_BLOCKS]]`
- Replace hard-coded anti-patterns with `[[ROTARIS:ANTI_PATTERNS]]`

**Implementation:**
```markdown
# Intent Classification Gate
...

[[ROTARIS:HARD_BLOCKS]]

[[ROTARIS:ANTI_PATTERNS]]

# Communication Style
...
```

**Effort:** 0.5 hours  
**Impact:** Medium (enables dynamic generation)  
**Testing:** Manual verification

---

### 5.4 Test Dynamic Generation

**File:** `tests/unit/test_dynamic_prompt_generation.py` (new)

**Changes:**
- Create unit tests for dynamic builders
- Test token replacement
- Test with different personas

**Effort:** 1 hour  
**Impact:** Medium (ensures correctness)  
**Testing:** Run pytest

---

**Phase 5 Total:** 4.5 hours

---

## Summary

| Phase | Tasks | Effort | Impact |
|-------|-------|--------|--------|
| 1: Quick Wins | Hard blocks, anti-patterns, communication | 2 hours | High |
| 2: Model Variants | Define variants for orchestrator, coding_agent, planner | 4.5 hours | High |
| 3: Tool Restrictions | Schema, enforcement, Oracle, Explore personas | 6 hours | High |
| 4: Specialized Personas | Momus, Metis, enhance Librarian/Planner | 11 hours | High |
| 5: Dynamic Generation | Extend renderer, add tokens, update prompts | 4.5 hours | Medium |
| **Total** | | **28 hours** | |

---

## Implementation Order

### Day 1 (8 hours)
- Phase 1: Quick Wins (2 hours)
- Phase 2: Model Variants (4.5 hours)
- Phase 3.1-3.2: Tool Restriction Schema & Enforcement (1.5 hours)

### Day 2 (8 hours)
- Phase 3.3-3.6: Oracle, Explore, Restrictions, Tests (6 hours)
- Phase 4.1: Momus Persona (2 hours)

### Day 3 (8 hours)
- Phase 4.2-4.6: Metis, Enhance Librarian/Planner, Register, Tests (8 hours)

### Day 4 (4 hours)
- Phase 5: Dynamic Generation (4.5 hours)

---

## Testing Strategy

### Unit Tests
- Tool restriction logic
- Model variant injection
- Dynamic prompt generation
- Token replacement

### Integration Tests
- Persona initialization
- Tool availability
- Prompt rendering

### Manual Tests
- TUI verification
- Agent behavior
- Response quality

---

## Rollout Strategy

### Phase 1: Internal Testing (1 day)
- Deploy to development environment
- Run full test suite
- Manual verification in TUI

### Phase 2: Beta Testing (1 day)
- Deploy to staging environment
- Test with real workloads
- Gather feedback

### Phase 3: Production Release (1 day)
- Deploy to production
- Monitor for issues
- Gather user feedback

---

## Success Criteria

✅ All hard blocks enforced  
✅ Model-specific variants injected correctly  
✅ Tool restrictions enforced  
✅ New personas registered and functional  
✅ Dynamic prompt generation working  
✅ All tests passing  
✅ No regressions in existing functionality  
✅ User feedback positive  

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking existing functionality | Comprehensive test suite, gradual rollout |
| Model variant injection fails | Unit tests, manual verification |
| Tool restrictions too strict | Configurable restrictions, easy override |
| New personas underperform | Iterative prompt refinement, feedback loop |
| Dynamic generation complexity | Modular design, incremental implementation |
