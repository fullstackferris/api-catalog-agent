# Failure Analysis

## Where the system breaks and why

### 1. Ambiguous entity resolution (S09 partial failure)

**What happens:** "Is the billing API any good?" - there is no `billing-api` in the catalog. The agent correctly retries with a tag search and finds three billing-adjacent APIs (invoicing, subscriptions, dunning). On `gpt-5.4-mini`, the agent picks `payments-api` as "the closest match" - a stretch.

**Why:** Tag-based fallback is a heuristic. The model has no semantic understanding of which match is the most appropriate; it picks the first plausible result.

**Fix:** Add an explicit disambiguation step: when a tag search returns multiple candidates, list all of them and ask the user to clarify rather than picking one. Alternatively, store canonical aliases in the catalog (`billing -> invoicing-api, subscriptions-api`) and resolve them before calling tools.

---

### 2. Spec quality assessment without path-level context (S06, S07 depth limit)

**What happens:** `scoreSpec` returns a score and violated rule IDs. `suggestImprovements` returns rule descriptions and examples. The agent can give generic fix advice, but cannot say "the `POST /orders` operation is missing a 400 response" - that requires reading the actual spec.

**Why:** Calling `loadSpec` for every scored spec is expensive and was the source of the original S08 regression (21 tool calls). The fix was to separate scoring from spec loading, but that reduced path-level specificity.

**Fix:** Add a targeted `getViolations(specName, ruleId)` tool that returns the specific paths/operations violating a given rule, without loading the entire spec into context. This preserves efficiency while enabling concrete path-level suggestions.

---

### 3. Reverse dependency lookup is shallow (one hop)

**What happens:** S04 asks "which deprecated APIs are still depended on?" The agent calls `queryCatalog(dependencies: ["reviews-api", ...])` and finds no results - correct for direct dependencies. But a production API could depend on something that depends on a deprecated API (transitive dependency).

**Why:** `queryCatalog` only checks `api.dependencies` for exact matches. There is no graph traversal.

**Fix:** For blast-radius queries, implement BFS/DFS over the dependency graph server-side. A `getBlastRadius(apiName)` tool that returns all transitive dependents would make S02 and S04 more accurate.
Something akin to this loose structure:

```typescript
interface CatalogNode {
  name: string;
  dependencies: string[];
  [key: string]: any;
}

interface GraphNode {
  data: CatalogNode;
  dependents: Set<string>; // reversed: who depends on this node, not what it depends on
}

class DependencyGraph {
  adjacencyList: Map<string, GraphNode> = new Map();

  addNode(data: CatalogNode) {}
  addEdge(dependent: string, dependency: string) {} // stores dependency → dependent (reversed)
  loadFromCatalog(catalog: CatalogNode[]) {} // catalog is already in memory, no file read needed
  bfs(start: string): string[] { return []; }
  dfs(start: string): string[] { return []; }
  getBlastRadius(apiName: string): string[] { return this.bfs(apiName); }
}
```

---

### 4. Tool call budget (S04 cost, S08 correctness at scale)

**What happens:** S04 (deprecated deps) currently makes 3 sequential `queryCatalog` calls - one to find deprecated APIs, then one per deprecated API to check reverse deps. At 3 deprecated APIs, this is fine. At 30, it would hit `TOOL_CALL_LIMIT = 15` and the agent would return a partial answer.

**Why:** The ReAct loop is sequential. Parallel tool calls are not supported by `createReactAgent` - each step waits for the previous result.

**Fix (short term):** Accept an array of names in the `dependencies` filter and execute the OR in a single call. Already partially done - the current filter uses `some()`, so passing all deprecated names at once is supported. The agent just needs to be instructed to batch them.

**Fix (long term):** Switch to a LangGraph custom graph with a `ToolNode` that fans out parallel tool calls. LangGraph supports parallel branches; `createReactAgent` does not.

---

### 5. Context window limit at scale (~40 specs)

**Current state:**
- 10 specs: ~27,500 tokens
- catalog.json: ~6,000 tokens
- rubric.json: ~1,400 tokens
- Total worst-case: ~35,000 tokens

**Context window by model:**
| Model | Context | Spec limit (loadSpec worst case) |
|---|---|---|
| gpt-4o | 128K | ~40 specs |
| gpt-5.4-mini | 400K | ~145 specs |

**Where it breaks:** At ~40 specs on gpt-4o (~145 on gpt-5.4-mini), accumulated spec content in the agent's message history pushes past the context limit. The model would either truncate context or throw a context-length error.

**Why:** LangGraph keeps all messages (including tool results) in the `messages` array passed to the LLM on every step. `scoreSpec` returns a score + rule list (small), but any `loadSpec` call returns a full YAML spec (~2,750 tokens each). Calling `loadSpec` on 40 specs = 110K tokens of tool results alone.

**Fix:** See `SCALING_PLAN.md`.

---

### 6. No persistence: every request starts fresh

**What happens:** If a user asks "which APIs are in the payments domain?" and then "which of those have the worst spec quality?" - the agent has no memory of the first answer. It re-queries the catalog on the second turn.

**Why:** `agent.invoke()` is stateless - no `MemorySaver` or thread ID. Each POST to `/ask` is an isolated conversation.

**Fix:** Add a `MemorySaver` checkpointer and pass a `thread_id` per user session. This allows multi-turn conversations without re-querying. For the single-turn use case in this assignment, statelessness is intentional.

---

### 7. Prompt injection is pattern-matched, not semantically detected

**What happens:** The `preHandler` blocks prompts containing `system override`, `ignore previous`, or `ignore all instructions` (case-insensitive). A determined attacker can rephrase: "disregard prior directives" passes the filter.

**Why:** Regex-based injection detection is a surface-level control. It catches naive attempts but not adversarial rephrasing.

**Fix:** Use a lightweight classifier (for example Llama Prompt Guard 2 (86M) and DeBERTa-v3) as the pre-check instead of regex. A fine-tuned classifier would catch semantic injection attempts. The regex remains useful as a cheap first-pass filter before the classifier. Which would suffice for this project
