/** HTTP methods recognized as operations within an OpenAPI path item. */
export const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/**
 * Flattens an OpenAPI spec's `paths` object into a list of individual operations.
 *
 * @param spec - A parsed OpenAPI spec (validated against `specSchema`).
 * @returns One entry per HTTP method defined on any path, pairing the method
 *          name with its operation object (summary, description, parameters, etc).
 */
export function operations(spec: any): { method: string; op: any }[] {
  const ops: { method: string; op: any }[] = [];
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = (pathItem as any)[method];
      if (op) ops.push({ method, op });
    }
  }
  return ops;
}

/**
 * DOC-01 (medium): Every operation defines both a non-empty summary and description.
 * @returns true if every operation has both fields populated.
 */
export function checkDOC01(spec: any): boolean {
  return operations(spec).every(({ op }) => op.summary?.trim() && op.description?.trim());
}

/**
 * DOC-02 (low): Every parameter and every schema property has a description.
 * @returns true if all operation parameters and all component schema properties
 *          carry a non-empty `description` field.
 */
export function checkDOC02(spec: any): boolean {
  const paramsOk = operations(spec).every(({ op }) =>
    (op.parameters ?? []).every((p: any) => p.description?.trim())
  );
  const schemas = Object.values(spec.components?.schemas ?? {});
  const propsOk = schemas.every((schema: any) =>
    Object.values(schema.properties ?? {}).every((p: any) => p.description?.trim())
  );
  return paramsOk && propsOk;
}

/**
 * DOC-03 (low): Request bodies and 2xx responses include at least one example.
 * @returns true if every request body (when present) and every 2xx response body
 *          (when present) includes an `example` or `examples` field.
 */
export function checkDOC03(spec: any): boolean {
  return operations(spec).every(({ op }) => {
    const reqContent = op.requestBody?.content;
    if (reqContent && !Object.values(reqContent).some((c: any) => c.example || c.examples)) return false;
    for (const [status, res] of Object.entries(op.responses ?? {})) {
      if (!status.startsWith("2")) continue;
      const content = (res as any).content;
      if (content && !Object.values(content).some((c: any) => c.example || c.examples)) return false;
    }
    return true;
  });
}

/**
 * SEC-01 (high): The spec declares at least one security scheme.
 * @returns true if `components.securitySchemes` has at least one entry.
 */
export function checkSEC01(spec: any): boolean {
  return Object.keys(spec.components?.securitySchemes ?? {}).length > 0;
}

/**
 * SEC-02 (high): Every operation is covered by authentication — either a
 * global `security` requirement or a per-operation `security` block.
 * @returns true if a global security requirement exists, or every operation
 *          individually declares one.
 */
export function checkSEC02(spec: any): boolean {
  const hasGlobal = (spec.security?.length ?? 0) > 0;
  return operations(spec).every(({ op }) => hasGlobal || (op.security?.length ?? 0) > 0);
}

/**
 * SEC-03 (medium): All server URLs use HTTPS, and no example payloads contain
 * real-looking secrets (API keys, bearer tokens, AWS access keys).
 * @returns false if any server uses `http://`, or if a secret-shaped string
 *          is found anywhere in the serialized spec.
 */
export function checkSEC03(spec: any): boolean {
  const servers = spec.servers ?? [];
  if (servers.some((s: any) => s.url?.startsWith("http://"))) return false;
  const raw = JSON.stringify(spec);
  const secretPattern = /(sk-[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9\-_.]{20,}|AKIA[0-9A-Z]{16})/;
  return !secretPattern.test(raw);
}

/**
 * DES-01 (medium): Paths use lowercase, hyphenated segments with no trailing
 * slash and no verbs — path parameters (`{id}`) are exempt.
 * @returns true if every path segment matches the naming convention.
 */
export function checkDES01(spec: any): boolean {
  const segmentPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return Object.keys(spec.paths ?? {}).every((path) => {
    if (path.endsWith("/") && path !== "/") return false;
    const segments = path.split("/").filter(Boolean);
    return segments.every((seg) => seg.startsWith("{") || segmentPattern.test(seg));
  });
}

/**
 * DES-02 (low): Schema property names use a consistent camelCase convention.
 * @returns true if every property name across every component schema matches camelCase.
 */
export function checkDES02(spec: any): boolean {
  const camelCase = /^[a-z][a-zA-Z0-9]*$/;
  return Object.values(spec.components?.schemas ?? {}).every((schema: any) =>
    Object.keys(schema.properties ?? {}).every((name) => camelCase.test(name))
  );
}

/**
 * DES-03 (medium): Every operation defines an `operationId`, and all
 * `operationId`s are unique within the spec.
 * @returns true if no operation is missing an id and no id repeats.
 */
export function checkDES03(spec: any): boolean {
  const ids = new Set<string>();
  return operations(spec).every(({ op }) => {
    if (!op.operationId || ids.has(op.operationId)) return false;
    ids.add(op.operationId);
    return true;
  });
}

/**
 * CMP-01 (medium): Every operation declares at least one 4xx response;
 * mutating operations (POST/PUT/PATCH/DELETE) also declare a 5xx response.
 * @returns true if all operations meet the applicable error-response requirement.
 */
export function checkCMP01(spec: any): boolean {
  const mutating = ["post", "put", "patch", "delete"];
  return operations(spec).every(({ method, op }) => {
    const statuses = Object.keys(op.responses ?? {});
    if (!statuses.some((s) => s.startsWith("4"))) return false;
    if (mutating.includes(method) && !statuses.some((s) => s.startsWith("5"))) return false;
    return true;
  });
}

/**
 * CMP-02 (high): Every 2xx response with a body references a schema
 * (inline or via `$ref`) — no untyped or empty response content.
 * @returns true if every 2xx response that has a `content` block also has a `schema`.
 */
export function checkCMP02(spec: any): boolean {
  return operations(spec).every(({ op }) =>
    Object.entries(op.responses ?? {}).every(([status, res]: [string, any]) => {
      if (!status.startsWith("2") || !res.content) return true;
      return Object.values(res.content).every((c: any) => !!c.schema);
    })
  );
}

/**
 * CMP-03 (low): `info.version`, `info.title`, `info.contact`, and at least
 * one `servers[]` entry are all present.
 * @returns true if all four metadata fields are populated.
 */
export function checkCMP03(spec: any): boolean {
  return !!(spec.info?.version && spec.info?.title && spec.info?.contact && (spec.servers?.length ?? 0) > 0);
}

/** Maps each rubric rule ID to its corresponding check function. */
export const RULE_CHECKS: Record<string, (spec: any) => boolean> = {
  "DOC-01": checkDOC01, "DOC-02": checkDOC02, "DOC-03": checkDOC03,
  "SEC-01": checkSEC01, "SEC-02": checkSEC02, "SEC-03": checkSEC03,
  "DES-01": checkDES01, "DES-02": checkDES02, "DES-03": checkDES03,
  "CMP-01": checkCMP01, "CMP-02": checkCMP02, "CMP-03": checkCMP03,
};

/**
 * Runs a single rubric rule against a spec by ID.
 * @param ruleId - A rubric rule ID (e.g. "DOC-01").
 * @param spec - The parsed OpenAPI spec to check.
 * @throws If `ruleId` has no corresponding entry in `RULE_CHECKS` — fails
 *         loudly rather than silently treating an unknown rule as passed.
 */
export function checkRule(ruleId: string, spec: any): boolean {
  const fn = RULE_CHECKS[ruleId];
  if (!fn) throw new Error(`No check implemented for rule ${ruleId}`);
  return fn(spec);
}