import { z } from "zod";
import { DEFAULT_TEMPERATURE, MAX_PROMPT_LENGTH } from "./constants";

export const scenarioSchema = z.object({
  id: z.string(),
  type: z.string(),
  prompt: z.string(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const catalogSchema = z.object({
  name: z.string(),
  domain: z.string(),
  status: z.string(),
  tags: z.array(z.string()),
  endpoints: z.number(),
  onboardedDate: z.string(),
  dependencies: z.array(z.string()),
  protocol: z.string(),
  owner: z.string().nullable(),
  gateway: z.string().nullable(),
});
export type CatalogRecord = z.infer<typeof catalogSchema>;

export const rubricSchema = z.object({
  version: z.string(),
  description: z.string(),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rules: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          severity: z.enum(["high", "medium", "low"]),
          description: z.string(),
          example: z.string(),
        })
      ),
    })
  ),
});
export type RubricRecord = z.infer<typeof rubricSchema>;

export const specSchema = z.object({
  openapi: z.string().optional(),
  info: z.object({
    title: z.string().optional(),
    version: z.string().optional(),
    contact: z.any().optional(),
  }).optional(),
  servers: z.array(z.object({ url: z.string() })).optional(),
  security: z.array(z.any()).optional(),
  paths: z.record(z.string(), z.any()),
  components: z.object({
    securitySchemes: z.record(z.string(), z.any()).optional(),
    schemas: z.record(z.string(), z.any()).optional(),
  }).optional(),
}).passthrough();

export type SpecRecord = z.infer<typeof specSchema>;

export const scoreSchema = z.object({
  score: z.number(),
  violatedRules: z.array(z.string()),
});
export type ScoreRecord = z.infer<typeof scoreSchema>;

export const AskBodySchema = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_LENGTH),
  temperature: z.number().min(0).max(2).default(DEFAULT_TEMPERATURE),
});

export const AskResponseSchema = z.object({
  reply: z.string(),
  tokensUsed: z.number(),
});

export const GuardedResponseSchema = z.object({
  safeToProceed: z.boolean().describe("True if the user's intent is benign and business-appropriate."),
  responseMessage: z.string().describe("The helpful answer to the user."),
  flaggedReason: z.string().optional().describe("Provide the reason if safeToProceed is false."),
});

export const AskResponseWithErrors = z.union([AskResponseSchema, GuardedResponseSchema, z.object({ error: z.string() })]);

export type AskResponse = z.infer<typeof AskResponseSchema>;
export type AskResponseWithErrors = z.infer<typeof AskResponseWithErrors>;