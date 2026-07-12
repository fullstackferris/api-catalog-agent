import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { catalog, specsByName, rubric } from "../memoryStore";
import { checkRule } from "./rules";
import { severityToWeight, findRuleById } from "../utils";
import { CatalogRecord } from "../schema";

const domains = [...new Set(catalog.map((c) => c.domain))];
const statuses = [...new Set(catalog.map((c) => c.status))];
const gateways = [...new Set(catalog.map((c) => c.gateway).filter(Boolean))];
const protocols = [...new Set(catalog.map((c) => c.protocol))];

export const queryCatalog = tool(
    async ({ name, domain, status, tags, dependencies, gateway, protocol }: {
        name?: string;
        domain?: string;
        status?: string;
        tags?: string[];
        dependencies?: string[];
        gateway?: string | null;
        protocol?: string;
    }) => {
        return JSON.stringify(catalog.filter(
            (api: CatalogRecord) =>
                (!name         || api.name.toLowerCase() === name.toLowerCase()) &&
                (!domain       || api.domain.toLowerCase() === domain.toLowerCase()) &&
                (!status       || api.status.toLowerCase() === status.toLowerCase()) &&
                (!tags         || tags.some((t) => api.tags.includes(t.toLowerCase()))) &&
                (!dependencies || dependencies.some((d) => api.dependencies.includes(d.toLowerCase()))) &&
                (gateway === undefined || api.gateway === gateway) &&
                (!protocol     || api.protocol.toLowerCase() === protocol.toLowerCase())
        ));
    },
    {
        name: "queryCatalog",
        description: "Search the API catalog by name, domain, status, tags, dependencies, gateway, and/or protocol.",
        schema: z.object({
            name: z.string().optional(),
            domain: z.string().optional().describe(`one of: ${domains.join(", ")}`),
            status: z.string().optional().describe(`one of: ${statuses.join(", ")}`),
            tags: z.array(z.string()).optional(),
            dependencies: z.array(z.string()).optional().describe("reverse dependency lookup — finds APIs that list these names in their own dependencies array"),
            gateway: z.string().nullable().optional().describe(`filter by gateway — pass null to find APIs with no gateway. one of: ${gateways.join(", ")}, or null`),
            protocol: z.string().optional().describe(`one of: ${protocols.join(", ")}`),
        }),
    }
);

export const loadSpec = tool(
    async ({ apiName }: { apiName: string }) => {
        const spec = specsByName.get(apiName);
        if (!spec) return { error: `No spec found for "${apiName}"` };
        return spec;
    },
    {
        name: "loadSpec",
        description: "Load the raw OpenAPI spec for a given API. Only call this when you need to reference specific paths or operations — e.g. to write path-level fix suggestions. Do NOT call before scoreSpec — scoring reads specs internally.",
        schema: z.object({ apiName: z.string() }),
    }
);

export const scoreSpec = tool(
    async ({ specName }: { specName: string }) => {
        const spec = specsByName.get(specName);
        if (!spec) return { error: `No spec found for "${specName}"` };

        const violatedRules: string[] = [];
        let totalWeight = 0;
        let earnedWeight = 0;

        for (const category of rubric.categories) {
            for (const rule of category.rules) {
                totalWeight += severityToWeight(rule.severity);
                if (checkRule(rule.id, spec)) {
                    earnedWeight += severityToWeight(rule.severity);
                } else {
                    violatedRules.push(rule.id);
                }
            }
        }

        return { score: Math.round((earnedWeight / totalWeight) * 100), violatedRules };
    },
    {
        name: "scoreSpec",
        description: 
            "Score an OpenAPI spec against the quality rubric. " +
            "Returns a numeric score and list of violated rule IDs. " +
            "Does NOT require loadSpec first — call scoreSpec directly after listSpecs.",
        schema: z.object({ specName: z.string() }),
    }
);

export const listSpecs = tool(
    async () => [...specsByName.keys()],
    {
        name: "listSpecs",
        description: "Returns the names of all available OpenAPI specs. Use this before scoreSpec or loadSpec to know which APIs have specs — do not call loadSpec on APIs not in this list.",
        schema: z.object({}),
    }
);

export const suggestImprovements = tool(
    async ({ violatedRuleIds }: { violatedRuleIds: string[] }) => {
        return violatedRuleIds.map((id) => findRuleById(id, rubric)).filter(Boolean);
    },
    {
        name: "suggestImprovements",
        description: "Returns structured rule details (id, title, description, example) for violated rules. Use after scoreSpec — then use this output to write concrete fix suggestions yourself.",
        schema: z.object({
            violatedRuleIds: z.array(z.string()),
        }),
    }
);
