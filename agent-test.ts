import { agent } from "./src/agent/agent";
import * as dotenv from "dotenv";

dotenv.config();

//import { specsByName } from "./memoryStore";
//import { checkCMP03, checkDOC01 } from "./agent/rules";
//console.log("payments-api gut check:", checkCMP03(specsByName.get("payments-api"))); // gut check
//console.log("inventory-api CMP-03:", checkCMP03(specsByName.get("inventory-api")));
//console.log("inventory-api DOC-01:", checkDOC01(specsByName.get("inventory-api")));

/**
 * This is a quick testing script to see output/evaluate the agent from the differnt test cases
 */

const testPrompts = [
  {
    label: "queryCatalog",
    prompt: "Which payment APIs are production-ready?",
  },
  {
    label: "loadSpec + scoreSpec",
    prompt: "Assess the quality of the payments-api spec.",
  },
  {
    label: "loadSpec + scoreSpec + suggestImprovements",
    prompt: "What's wrong with the inventory-api spec? Give me concrete fixes.",
  },
  {
    label: "ambiguous handling",
    prompt: "Is the billing API any good?",
  },
];

async function main() {
  for (const { label, prompt } of testPrompts) {
    console.log(`\n\n========== ${label} ==========`);
    console.log(`PROMPT: ${prompt}\n`);
    try {
      const result = await agent.invoke({
        messages: [{ role: "user", content: prompt }],
      });
      const finalAnswer = result.messages.at(-1)?.content;
      console.log("--- FINAL ANSWER ---");
      console.log(finalAnswer);

      // Bonus: show which tools actually got called, in order
      const toolCalls = result.messages
        .filter((m: any) => m.tool_calls?.length)
        .flatMap((m: any) => m.tool_calls.map((tc: any) => tc.name));
      console.log("\n--- TOOLS CALLED ---");
      console.log(toolCalls.length ? toolCalls.join(" → ") : "(none)");
    } catch (err) {
      console.log("--- ERROR ---");
      console.error(err);
    }
  }
}

main();