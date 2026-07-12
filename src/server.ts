import "dotenv/config"; // must be first — loads .env before any other module reads process.env
import Fastify from "fastify";
import { 
  validatorCompiler, 
  serializerCompiler, 
  ZodTypeProvider 
} from 'fastify-type-provider-zod';
import { AskBodySchema, AskResponseSchema, AskResponseWithErrors } from './schema';
import { agent } from './agent/agent';
import { DEFAULT_PORT, DEFAULT_HOST, TOOL_CALL_LIMIT, REQUEST_TIMEOUT_MS } from './constants';
import { preHandler, postHandler } from './agent/guardrails';

// fastify with zod type provider
const app = Fastify().withTypeProvider<ZodTypeProvider>();
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const host = process.env.HOST ?? DEFAULT_HOST;

app.get("/health", async () => ({ status: "ok" }));

app.route({
  method: 'POST',
  url: '/ask',
  schema: {
    body: AskBodySchema,
    response: {
      200: AskResponseSchema,
      400: AskResponseWithErrors,
      500: AskResponseWithErrors,
    },
  },
  handler: async (request, reply) => {
    const { prompt } = request.body;

    const pre = preHandler(prompt);
    if (!pre.passed) {
      return reply.status(400).send({ error: pre.reason });
    }

    let result;
    try {
      result = await Promise.race([
        agent.invoke(
          { messages: [{ role: "user", content: prompt }] },
          { recursionLimit: TOOL_CALL_LIMIT }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Agent timed out")), REQUEST_TIMEOUT_MS)
        ),
      ]);
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }

    const raw = String(result.messages.at(-1)?.content ?? "(no response)");
    const finalAnswer = postHandler(raw);

    return reply.send({
      reply: finalAnswer,
      tokensUsed: result.messages.reduce(
        (sum: number, m: any) => sum + (m.usage_metadata?.total_tokens ?? 0),
        0
      ),
    });
  },
});

// start the server
const start = async () => {
  try {
    await app.listen({ port, host });
    console.log(`Server listening on http://${host}:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();