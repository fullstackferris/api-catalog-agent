import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { queryCatalog, loadSpec, scoreSpec, suggestImprovements, listSpecs } from "./tools";
import { MODEL_NAME } from "../constants";

export const agent = createReactAgent({
  llm: new ChatOpenAI({ model: MODEL_NAME }),
  prompt: SYSTEM_PROMPT,
  tools: [queryCatalog, listSpecs, loadSpec, scoreSpec, suggestImprovements],
});