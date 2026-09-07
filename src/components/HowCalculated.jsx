import { getRule } from '../lib/rules/registry';

/**
 * "How was this calculated" affordance. Renders an info button that reveals the
 * rule's formula, source, rule year and last-verified date. Placeholder
 * implementation until the registry is populated (ROADMAP.md item 45).
 */
export default function HowCalculated({ ruleId, children }) {
  const rule = getRule(ruleId);
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        className="text-xs text-slate-500 hover:text-navy-700 dark:hover:text-navy-300"
        title={rule ? `${rule.title}: ${rule.formula}` : 'How was this calculated?'}
        aria-label="How was this calculated?"
      >
        ⓘ
      </button>
    </span>
  );
}
