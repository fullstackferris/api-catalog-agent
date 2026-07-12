# Scaling Plan

## Current architecture and its limits

The system loads the full catalog (60 APIs, ~6K tokens), rubric (12 rules, ~1.4K tokens), and spec names into memory at startup. Spec bodies are read from disk on demand via `loadSpec`/`scoreSpec`. The LLM receives filtered catalog results and scored spec data as tool outputs within its message history.

**Context window math:**
- 10 specs × ~2,750 tokens = ~27,500 tokens
- catalog.json = ~6,000 tokens
- rubric.json = ~1,400 tokens
- Worst case (all specs loaded + full catalog in context): ~35,000 tokens

**Context window by model:**
| Model | Context | Spec limit (loadSpec worst case) |
|---|---|---|
| gpt-4o | 128K | ~40 specs |
| gpt-5.4-mini | 400K | ~145 specs |

**Breaks at:** ~40 specs on gpt-4o, ~145 specs on gpt-5.4-mini, if all specs are loaded into a single session's message history. Catalog size becomes the constraint at ~3,000 entries regardless of model.

---

## Scaling path: 1,000s of APIs and 100s of specs

### Phase 1: Move catalog to a queryable store

**Problem:** The current `queryCatalog` tool filters an in-memory array. At 3,000+ APIs, this still fits in memory (~300KB JSON), but returning unfiltered slices as tool output becomes expensive in tokens.

**Fix:** Store the catalog in a lightweight embedded DB (SQLite via `better-sqlite3`) or a hosted Postgres instance. `queryCatalog` executes a SQL query and returns only the matching rows. Token cost stays proportional to result size, not catalog size.

At 10,000+ APIs, add an index on frequently queried fields: `domain`, `status`, `gateway`, `protocol`.

### Phase 2: RAG for spec content

**Problem:** At 100+ specs, `scoreSpec` on all of them in a single query (S08 "rank all specs") is impractical. Loading specs individually costs one tool call per spec. At 100 specs, S08 requires 101 tool calls - far past `TOOL_CALL_LIMIT`.

**Fix:** Move to a RAG (retrieval-augmented generation) architecture for spec content:
1. **Pre-compute scores** via a cron job or file-watcher triggered on spec update: store `{ specName, score, violatedRules }` in a `spec_scores` table. `scoreSpec` becomes a DB lookup, not a live rubric evaluation.
2. **Embed spec content** at the path/operation level using a text embedding model (e.g., `text-embedding-3-small`). Store embeddings in a vector DB (Pinecone, pgvector, or Qdrant). Replace `loadSpec` with a `searchSpec(query)` tool that retrieves only the relevant path/operation chunks via semantic similarity - not the full YAML. This is the RAG retrieval step: the agent's query becomes the retrieval query, and only the top-k relevant chunks are injected into context.
3. **S08 "rank all specs"** becomes a single DB query on `spec_scores` - zero LLM calls for the scoring step.

### Phase 3: Agent routing for query type

**Problem:** As query complexity grows, a single ReAct agent becomes expensive - every request pays the cost of tool selection regardless of whether the query needs tools.

**Fix:** Add a lightweight classifier in front of the agent that routes queries to one of:
- **Direct DB lookup** (no LLM): "list all production APIs in the payments domain" → SQL query → return JSON. Sub-100ms, zero LLM tokens.
- **QA agent** (catalog tools only): natural-language catalog questions.
- **Assessment agent** (spec tools only): spec scoring and improvement suggestions.
- **Compound agent** (all tools): cross-domain queries that need both.

The classifier itself can be a fast model (gpt-4.1-mini) given a small prompt classification task.

### Phase 4: Parallel tool execution

**Problem:** LangGraph's `createReactAgent` is sequential - each tool call blocks the next. S08 at 100 specs = 100 sequential `scoreSpec` calls, each waiting on the previous.

**Fix:** Migrate from `createReactAgent` to a custom LangGraph graph with a `ToolNode` that supports parallel fan-out. LangGraph's `Send` API allows the graph to dispatch multiple tool calls simultaneously. S08 at 100 specs becomes a single fan-out to 100 parallel `scoreSpec` calls with a join before the final reasoning step.

### Phase 5: Caching and incremental updates

**Problem:** Spec scores and catalog filters are recomputed on every request.

**Fix:**
- Cache `scoreSpec` results in Redis with a TTL matching the spec update cadence (e.g., 1 hour). Invalidate on spec file change.
- Cache `queryCatalog` results for common filter combinations with a short TTL (30s) to handle burst traffic.
- Precompute spec embeddings on file write, not on request.

---

## Summary table

| Problem | Threshold | Fix |
|---|---|---|
| Catalog too large for in-memory filter | ~3,000 APIs | SQLite/Postgres with indexed queries |
| Spec loading too expensive | ~40 specs in one session | Pre-computed scores + RAG (vector search) for content |
| S08 "rank all" too slow | ~30 specs | Score DB lookup (no LLM) |
| Too many sequential tool calls | ~15 tool calls | Custom LangGraph graph with parallel ToolNode |
| Redundant recomputation | Any scale | Redis cache for scores + query results |
| Single agent handles all queries | ~50 queries/sec | Classifier-based routing to specialized agents |
