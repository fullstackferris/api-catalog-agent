export const MODEL_NAME = process.env.MODEL_NAME ?? "gpt-4o";
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000);

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = "0.0.0.0";
export const DEFAULT_TEMPERATURE = 0.7;

export const TOOL_CALL_LIMIT = 15;
export const MAX_PROMPT_LENGTH = 2_000;

export const INJECTION_PATTERN = new RegExp(
  [
    'system\\s+override',
    'ignore\\s+(all\\s+)?(previous|prior)\\s+(instructions?|rules?|guidelines?)',
    'ignore\\s+all\\s+instructions',
    'override\\s+(your\\s+)?(instructions?|rules?|guidelines?)',
    'you\\s+are\\s+no\\s+longer\\s+(bound|restricted|limited)',
    'bypass\\s+(your\\s+)?(safety|security|content|ethical)\\s+(filters?|measures?)',
  ].join('|'),
  'i'
);

export const SECRET_REDACTION_PATTERN = /AI_SECRET_KEY_\S+/gi;
export const REDACTED_PLACEHOLDER = "[REDACTED BY SECURITY GUARDRAIL]";
