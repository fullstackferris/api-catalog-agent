import { readFileSync, readdirSync } from "fs";
import path from "path";
import { parse as parseYAML } from "yaml";
import { z } from "zod";
import { catalogSchema, rubricSchema, scenarioSchema, specSchema } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const SPECS_DIR = path.join(DATA_DIR, "specs");

// console.log("DATA_DIR", DATA_DIR);
// console.log("SPECS_DIR", SPECS_DIR);

export const catalog = z
    .object({
        apis: z.array(catalogSchema),
    })
    .transform((data) => data.apis)
    .parse(JSON.parse(readFileSync(path.join(DATA_DIR, "catalog.json"), "utf-8")));

export const catalogByName = new Map(catalog.map((c) => [c.name, c]));

export const rubric = rubricSchema.parse(
  JSON.parse(readFileSync(path.join(DATA_DIR, "rubric.json"), "utf-8"))
);

export const scenarios = z
  .object({
    scenarios: z.array(scenarioSchema), // Or whatever the key name is inside scenarios.json
  })
  .transform((data) => data.scenarios) 
  .parse(JSON.parse(readFileSync(path.join(DATA_DIR, "scenarios.json"), "utf-8")));

const specFiles = readdirSync(SPECS_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

export const specsByName = new Map(
  specFiles.map((file) => {
    const name = file.replace(/\.ya?ml$/, "");
    const spec = specSchema.parse(parseYAML(readFileSync(path.join(SPECS_DIR, file), "utf-8")));
    return [name, spec];
  })
);