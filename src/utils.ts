/**
 * Numeric weight assigned to each rubric severity tier, used by `scoreSpec`
 * to compute a weighted 0-100 quality score. Values are a deliberate design
 * choice (not specified by rubric.json) — high-severity failures should cost
 * proportionally more than low-severity ones.
 */
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
};

/**
 * Converts a rubric rule's severity label into its numeric scoring weight.
 * @param severity - One of the severity strings used in rubric.json ("high" | "medium" | "low").
 * @throws If `severity` doesn't match a known tier — surfaces bad rubric data
 *         immediately instead of silently scoring it as zero.
 */
export function severityToWeight(severity: string): number {
  const weight = SEVERITY_WEIGHTS[severity];
  if (weight === undefined) {
    throw new Error(`Unknown severity level: "${severity}"`);
  }
  return weight;
}

/**
 * Looks up a rubric rule's full definition (title, description, example) by its ID.
 * Used by `suggestImprovements` to give the LLM real rule context instead of
 * letting it invent rule content from the ID alone.
 * @param ruleId - A rubric rule ID (e.g. "CMP-03").
 * @param rubric - The parsed rubric object (validated against `rubricSchema`).
 * @returns The matching rule object, or `undefined` if no rule with that ID exists.
 */
export function findRuleById(ruleId: string, rubric: any) {
  for (const category of rubric.categories) {
    const rule = category.rules.find((r: any) => r.id === ruleId);
    if (rule) return rule;
  }
  return undefined;
}