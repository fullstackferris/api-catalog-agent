# Decision Log

## What was built

A Fastify HTTP server exposing a `/ask` endpoint backed by a LangGraph ReAct agent. The agent has five tools: `queryCatalog`, `listSpecs`, `loadSpec`, `scoreSpec`, and `suggestImprovements`. It reasons over a 60-API catalog, 10 OpenAPI specs, and a 12-rule quality rubric using a single LLM.

## Key decisions

### LangGraph ReAct over a chain or a single LLM call

**Chosen:** `createReactAgent` from `@langchain/langgraph/prebuilt`.

**Alternatives considered:**
- Plain function calling with a single LLM prompt: works for QA-only queries but can't handle multi-step assess workflows (list specs → score → suggest fixes).
- A fixed chain (prompt → tool → LLM): fragile - hardcoded sequence can't adapt to ambiguous queries.
- Multiple agents (one for QA, one for assessment): unnecessary complexity for 10 scenarios; one agent with well-described tools handles both.

**Why ReAct:** the agent decides at runtime which tools to call and in what order. This is the correct abstraction when query types are heterogeneous and the number of required tool calls varies per query.

### Tool decomposition: five small tools over two large ones

**Chosen:** `queryCatalog` (catalog search), `listSpecs` (spec index), `loadSpec` (raw spec), `scoreSpec` (score + violations), `suggestImprovements` (rule detail lookup).

**Alternatives considered:**
- One `search` tool that did everything: the LLM can't be given precise enough instructions about when to score vs when to just list.
- Merging `scoreSpec` + `suggestImprovements` into one tool: loses composability - `suggestImprovements` is also useful standalone.
- Having `suggestImprovements` call a second LLM to generate fix text: adds latency, tokens, and a second model dependency. The ReAct agent's own reasoning turn is sufficient for generating fix suggestions from rule metadata.

**Why five:** each tool does exactly one thing. Tool descriptions give the model just enough context to decide which to call and when.

### `listSpecs` as a separate tool (not loading specs into context)

**Chosen:** `listSpecs` returns the 10 spec names. The agent calls `scoreSpec(name)` per spec; specs are loaded internally during scoring and never put into the conversation.

**Alternatives considered:**
- Loading all 10 specs into the system prompt: ~27,500 tokens upfront on every request, even for simple QA queries.
- Loading specs lazily via `loadSpec` before every `scoreSpec`: the agent learned to call `loadSpec` for all 10 before scoring any, costing 21 unnecessary tool calls on S08.

**Why `listSpecs`:** the agent gets a name index without seeing the spec bodies. `scoreSpec` reads specs internally. This pattern keeps the S08 "rank all specs" scenario at 11 tool calls (1 list + 10 scores) with no wasted `loadSpec` calls.

### queryCatalog: reverse dependency lookup via `dependencies` filter

**Chosen:** `queryCatalog` accepts a `dependencies` array that finds APIs listing those names in their own `dependencies` field (reverse lookup).

**Alternatives considered:**
- Two separate tools: `getDependencies` and `getReverseDependencies`. Over-engineered for the catalog size.
- Telling the agent to fetch all APIs and filter manually: would require loading 60 records into the reasoning context.

**Why in the tool:** the model cannot reliably write JS array filtering logic in its head. Providing a semantic `dependencies` filter that does reverse lookup means the agent makes one `queryCatalog(dependencies: ["ledger-api"])` call and gets the correct result.

### Guardrails as plain functions, not middleware

**Chosen:** `preHandler` and `postHandler` are exported functions called imperatively inside the Fastify route handler.

**Alternatives considered:**
- LangGraph middleware via `createMiddleware`: doesn't compose cleanly with `createReactAgent` - requires a different graph construction pattern.
- Fastify `preHandler` hooks: works, but obscures the guardrail logic from the agent call site.

**Why plain functions:** testable in isolation, readable at the call site, no framework coupling. The pre-check runs before the agent, the post-check redacts secrets from the response.

### Model: gpt-5.4-mini as default (not gpt-4o)

**Chosen:** `MODEL_NAME=gpt-5.4-mini` in `.env.example`.

**Comparison on 10 scenarios:**
- mini wins 6/10 (more concise, proactive follow-ups, half the latency on assess scenarios)
- 4o wins 2/10 (S08: includes violated rule IDs per spec; S09: surfaces all billing-adjacent APIs rather than picking one)
- 2 ties

**Why mini:** faster, cheaper, and responds better on ambiguous queries (S10). The two scenarios where 4o wins are improvable via system prompt tuning rather than model upgrade.

### System prompt: explicit retry instruction for ambiguous name lookups

**Chosen:** The system prompt includes a hard `MUST` rule: if a name lookup returns nothing, retry `queryCatalog` with `tags: [keywords]` before concluding the API doesn't exist.

**Why:** Without this, the agent on S09 ("Is the billing API any good?") returned "no billing API found" immediately after the name miss. The tag retry surfaces invoicing/subscriptions/dunning-api as billing-adjacent. This is a tool-hint problem: the model doesn't know that `tags` is a valid fallback without explicit instruction.
