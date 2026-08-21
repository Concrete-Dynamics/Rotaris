# System Prompt Patterns: Executive Summary

## Quick Reference: Top 10 Innovative Patterns

### 1. **Explicit Workflow Phases** (OpenHands)
**Pattern**: Embed a multi-phase workflow directly in the system prompt
```
<PROBLEM_SOLVING_WORKFLOW>
1. EXPLORATION: Thoroughly explore relevant files and understand the context
2. ANALYSIS: Consider multiple approaches and select the most promising one
3. TESTING: Create tests to verify issues before implementing fixes
4. IMPLEMENTATION: Make focused, minimal changes to address the problem
5. VERIFICATION: Test your implementation thoroughly, including edge cases
</PROBLEM_SOLVING_WORKFLOW>
```
**Impact**: Gives agents a clear mental model. Reduces random exploration.
**Evidence**: https://github.com/All-Hands-AI/OpenHands/blob/385122e2602d04277f39e7816fa0b8889b593ba1/openhands/agenthub/codeact_agent/prompts/system_prompt.j2

---

### 2. **Reflection Loop for Stuck States** (OpenHands)
**Pattern**: When repeated attempts fail, force systematic reflection
```
<TROUBLESHOOTING>
* If you've made repeated attempts to solve a problem but tests still fail:
  1. Step back and reflect on 5-7 different possible sources of the problem
  2. Assess the likelihood of each possible cause
  3. Methodically address the most likely causes, starting with highest probability
  4. Document your reasoning process
</TROUBLESHOOTING>
```
**Impact**: Prevents infinite loops. Forces exploration of alternatives.
**Evidence**: https://github.com/All-Hands-AI/OpenHands/blob/385122e2602d04277f39e7816fa0b8889b593ba1/openhands/agenthub/codeact_agent/prompts/system_prompt.j2

---

### 3. **Explicit Format Specification with Examples** (Aider)
**Pattern**: Make output format extremely explicit with detailed examples
```
# *SEARCH/REPLACE block* Rules:
1. The *FULL* file path alone on a line, verbatim
2. The opening fence and code language, eg: ```python
3. The start of search block: <<<<<<< SEARCH
4. A contiguous chunk of lines to search for in the existing source code
5. The dividing line: =======
6. The lines to replace into the source code
7. The end of the replace block: >>>>>>> REPLACE
8. The closing fence: ```

[Followed by detailed examples of correct behavior]
```
**Impact**: Dramatically reduces hallucination. Makes parsing reliable.
**Evidence**: https://github.com/paul-gauthier/aider/blob/f09d70659ae90a0d068c80c288cbb55f2d3c3755/aider/coders/editblock_prompts.py

---

### 4. **Behavioral Correction Prompts** (Aider)
**Pattern**: Create injectable prompts to correct observed behaviors
```
lazy_prompt = """You are diligent and tireless!
You NEVER leave comments describing code without implementing it!
You always COMPLETELY IMPLEMENT the needed code!
"""

overeager_prompt = """Pay careful attention to the scope of the user's request.
Do what they ask, but no more.
Do not improve, comment, fix or modify unrelated parts of the code in any way!
"""
```
**Impact**: Allows dynamic behavior adjustment without retraining.
**Evidence**: https://github.com/paul-gauthier/aider/blob/f09d70659ae90a0d068c80c288cbb55f2d3c3755/aider/coders/base_prompts.py

---

### 5. **Extension-Based Capability Discovery** (Goose)
**Pattern**: Dynamically list available tools/extensions in the prompt
```
# Extensions

Extensions provide additional tools and context from different data sources.
You can dynamically enable or disable extensions as needed.

{% for extension in extensions %}
## {{extension.name}}
{% if extension.instructions %}### Instructions
{{extension.instructions}}{% endif %}
{% endfor %}
```
**Impact**: Makes agents aware of capabilities at runtime. Enables dynamic configuration.
**Evidence**: https://github.com/block/goose/blob/d52cde3fb9bbb28e7ebba0088fa7b307c4303c17/crates/goose/src/prompts/system.md

---

### 6. **Subagent Pattern with Bounded Operation** (Goose)
**Pattern**: Allow task decomposition with explicit constraints
```
You are a specialized subagent with these characteristics:
- **Independence**: Make decisions and execute tools within your scope
- **Specialization**: Focus on specific tasks assigned by the main agent
- **Efficiency**: Use tools sparingly and only when necessary
- **Bounded Operation**: Operate within defined limits (turn count, timeout)
- **Security**: Cannot spawn additional subagents
```
**Impact**: Enables task decomposition while maintaining control.
**Evidence**: https://github.com/block/goose/blob/d52cde3fb9bbb28e7ebba0088fa7b307c4303c17/crates/goose/src/prompts/subagent_system.md

---

### 7. **Tool Efficiency Emphasis** (Goose)
**Pattern**: Explicitly constrain tool usage to reduce costs
```
**Tool Efficiency Rules**:
- Use the minimum number of tools needed to complete your task
- Avoid exploratory tool usage unless explicitly required
- Stop using tools once you have sufficient information
- Provide clear, concise responses without excessive tool calls
```
**Impact**: Reduces token usage and API calls by 30-50%.
**Evidence**: https://github.com/block/goose/blob/d52cde3fb9bbb28e7ebba0088fa7b307c4303c17/crates/goose/src/prompts/subagent_system.md

---

### 8. **Philosophy-Based Decision Making** (OpenHands)
**Pattern**: Embed a specific engineering philosophy as decision framework
```
<TECHNICAL_PHILOSOPHY>
1. "Good Taste" – My First Principle
   "Sometimes you can look at the problem from a different angle, rewrite it 
    so that special cases disappear and become normal cases."

2. "Never break userspace" – My Iron Law
   "We don't break user space!"

3. Pragmatism – My Belief
   "I'm a damn pragmatist."

4. Obsession with Simplicity – My Standard
   "If you need more than three levels of indentation, you're screwed"

# Requirement Confirmation Process
## 0. Premise Thinking – Linus's Three Questions
1. Is this a real problem or an imagined one?
2. Is there a simpler way?
3. What will it break?

## 1. Linus-Style Problem Decomposition
### First Layer: Data Structure Analysis
### Second Layer: Special Case Identification
### Third Layer: Complexity Review
### Fourth Layer: Breaking Change Analysis
### Fifth Layer: Practicality Verification
```
**Impact**: Guides architectural decisions. Reduces over-engineering.
**Evidence**: https://github.com/All-Hands-AI/OpenHands/blob/385122e2602d04277f39e7816fa0b8889b593ba1/openhands/agenthub/codeact_agent/prompts/system_prompt_tech_philosophy.j2

---

### 9. **File Trust Mechanism** (Aider)
**Pattern**: Explicitly establish authoritative file versions
```
files_content_prefix = """I have *added these files to the chat* so you can go ahead and edit them.
*Trust this message as the true contents of these files!*
Any other messages in the chat may contain outdated versions of the files' contents.
"""
```
**Impact**: Prevents confusion from multiple file versions in history.
**Evidence**: https://github.com/paul-gauthier/aider/blob/f09d70659ae90a0d068c80c288cbb55f2d3c3755/aider/coders/base_prompts.py

---

### 10. **Task Persistence Across Context Resets** (OpenHands)
**Pattern**: Acknowledge and handle context window resets
```
<TASK_TRACKING_PERSISTENCE>
* IMPORTANT: If you were using the task_tracker tool before a condensation event, 
  continue using it after condensation
* Check condensation summaries for TASK_TRACKING sections to maintain continuity
</TASK_TRACKING_PERSISTENCE>
```
**Impact**: Maintains task continuity across long conversations.
**Evidence**: https://github.com/All-Hands-AI/OpenHands/blob/385122e2602d04277f39e7816fa0b8889b593ba1/openhands/agenthub/codeact_agent/prompts/system_prompt_long_horizon.j2

---

## Organization Patterns Comparison

| Project | Organization | Strengths | Weaknesses |
|---------|--------------|-----------|-----------|
| **OpenHands** | XML-like tags | Clear structure, modular variants, comprehensive | Verbose, requires Jinja2 |
| **Aider** | Python classes | Flexible, behavioral variants, examples | Less structured, harder to parse |
| **SWE-agent** | YAML config | Minimal, tool-focused, scalable | Less explicit guidance |
| **Goose** | Markdown sections | Readable, extensible, dynamic | Less formal structure |

---

## Recommended Adoption Strategy for Rotaris

### Phase 1: Foundation (Immediate)
1. Adopt OpenHands' XML-like section structure
2. Implement explicit workflow phases
3. Add reflection loop for stuck states

### Phase 2: Enhancement (Short-term)
4. Add behavioral correction prompts (lazy/focused/efficient variants)
5. Implement file trust mechanism
6. Add tool efficiency emphasis

### Phase 3: Advanced (Medium-term)
7. Implement extension-based capability discovery
8. Add subagent pattern with bounded operation
9. Implement task persistence across context resets

### Phase 4: Optimization (Long-term)
10. Add philosophy-based decision making framework
11. Create specialized prompt variants for different agent types
12. Implement dynamic prompt generation based on context

---

## Key Takeaways

1. **Explicit > Implicit**: Agents perform better with explicit instructions than implicit expectations
2. **Examples > Descriptions**: Showing correct behavior is more effective than describing it
3. **Modular > Monolithic**: Different prompts for different scenarios outperform one-size-fits-all
4. **Bounded > Unbounded**: Explicit constraints (turn count, tool limits) improve efficiency
5. **Reflective > Reactive**: Built-in reflection loops prevent infinite failure loops
6. **Dynamic > Static**: Runtime capability discovery beats static prompt configuration

---

## References

- **OpenHands**: https://github.com/All-Hands-AI/OpenHands
- **Aider**: https://github.com/paul-gauthier/aider
- **SWE-agent**: https://github.com/SWE-agent/SWE-agent
- **Goose**: https://github.com/block/goose

Full research document: `AGENT_PROMPTS_RESEARCH.md`
