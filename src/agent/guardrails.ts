import {
    INJECTION_PATTERN,
    SECRET_REDACTION_PATTERN,
    REDACTED_PLACEHOLDER,
    MAX_PROMPT_LENGTH,
} from "../constants";

export type GuardrailResult =
    | { passed: true }
    | { passed: false; reason: string };

export function preHandler(prompt: string): GuardrailResult {
    if (prompt.length > MAX_PROMPT_LENGTH) {
        return { passed: false, reason: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters.` };
    }

    if (INJECTION_PATTERN.test(prompt)) {
        return { passed: false, reason: "Unauthorized prompt pattern detected." };
    }

    return { passed: true };
}

export function postHandler(response: string): string {
    return response.replace(SECRET_REDACTION_PATTERN, REDACTED_PLACEHOLDER);
}
