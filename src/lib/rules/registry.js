/**
 * Rule provenance registry: every rule FireFed applies, with its formula,
 * primary source, the rule year, and when it was last verified. Being filled
 * in; see ROADMAP.md items 45 and 46.
 */
export const RULES = Object.freeze({});
export function getRule(id) {
  return RULES[id] ?? null;
}
