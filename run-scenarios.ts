import "dotenv/config"; // must be first — loads .env before any other module reads process.env

import { agent } from "./src/agent/agent";
import { scenarios } from "./src/memoryStore";
import { writeFileSync, mkdirSync } from "fs";
import { MODEL_NAME } from "./src/constants";

type ScenarioResult = {
  id: string;
  type: string;
  prompt: string;
  toolsCalled: string[];
  response: string;
  meta: {
    model: string;
    tokensUsed: number;
    toolCallCount: number;
    latencyMs: number;
  };
};

async function runScenario(scenario: any): Promise<ScenarioResult> {
  const t0 = Date.now();

  const result = await agent.invoke({
    messages: [{ role: "user", content: scenario.prompt }],
  });

  const latencyMs = Date.now() - t0;
  const finalAnswer = result.messages.at(-1)?.content ?? "(no response)";

  const toolsCalled = result.messages
    .filter((m: any) => m.tool_calls?.length)
    .flatMap((m: any) => m.tool_calls.map((tc: any) => tc.name));

  const tokensUsed = result.messages.reduce(
    (sum: number, m: any) => sum + (m.usage_metadata?.total_tokens ?? 0),
    0
  );

  return {
    id: scenario.id,
    type: scenario.type,
    prompt: scenario.prompt,
    toolsCalled,
    response: typeof finalAnswer === "string" ? finalAnswer : JSON.stringify(finalAnswer),
    meta: {
      model: MODEL_NAME,
      tokensUsed,
      toolCallCount: toolsCalled.length,
      latencyMs,
    },
  };
}

async function main() {
  const t0 = Date.now();
  const results: ScenarioResult[] = [];

  console.log(`Using model: ${MODEL_NAME}`);

  for (const scenario of scenarios) {
    console.log(`Running ${scenario.id}...`);
    try {
      results.push(await runScenario(scenario));
    } catch (err) {
      results.push({
        id: scenario.id,
        type: scenario.type,
        prompt: scenario.prompt,
        toolsCalled: [],
        response: `ERROR: ${(err as Error).message}`,
        meta: { model: MODEL_NAME, tokensUsed: 0, toolCallCount: 0, latencyMs: 0 },
      });
    }
  }

  mkdirSync("results", { recursive: true });
  writeFileSync("results/scenario-results.json", JSON.stringify(results, null, 2));
  console.log(`Done. ${results.length} results written in ${Date.now() - t0}ms`);
}

main();