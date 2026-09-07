import { describe, expect, it } from 'vitest';
import { RULES, RULE_CATEGORIES, getRule, listRules, listRulesByCategory } from '../registry';

const REQUIRED_IDS = [
  'fers.annuity',
  'fers.multiplier',
  'fers.mra10_reduction',
  'fers.deferred_freeze',
  'fers.sick_leave',
  'fers.survivor',
  'fers.contribution_rate',
  'fers.refund',
  'fers.eligibility',
  'srs.amount',
  'srs.earnings_test',
  'ss.claiming_factor',
  'ss.fra',
  'ss.taxation',
  'tsp.access',
  'tsp.sepp',
  'tsp.roth_ladder',
  'tsp.employer_match',
  'tsp.limits',
  'fehb.five_year',
  'healthcare.fehb_premium',
  'healthcare.medicare',
  'healthcare.irmaa',
  'cola.diet',
  'tax.federal',
  'tax.capital_gains',
  'tax.state',
  'tax.fica',
  'timeline.sustainable',
  'timeline.bridge',
  'timeline.withdrawal_order',
  'fire.date',
  'leave.lump_sum',
  'career.wgi',
  'career.promotion',
  'mc.method',
];

describe('rules registry', () => {
  it('contains every rule id the UI references', () => {
    for (const id of REQUIRED_IDS) {
      expect(RULES[id], `missing rule ${id}`).toBeDefined();
      expect(getRule(id)?.id).toBe(id);
    }
  });

  it('returns null for an unknown id rather than throwing', () => {
    expect(getRule('nope.missing')).toBeNull();
    expect(getRule(undefined)).toBeNull();
  });

  it('gives every rule a https source, a rule year, and a last-verified date', () => {
    for (const r of listRules()) {
      expect(r.source?.url, `${r.id} source url`).toMatch(/^https:\/\//);
      expect(r.source?.name, `${r.id} source name`).toBeTruthy();
      expect(Number.isInteger(r.ruleYear), `${r.id} ruleYear`).toBe(true);
      expect(r.ruleYear).toBeGreaterThanOrEqual(2026);
      expect(r.lastVerified, `${r.id} lastVerified`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(r.lastVerified))).toBe(false);
      expect(r.verifiedAgainst, `${r.id} verifiedAgainst`).toBeTruthy();
    }
  });

  it('gives every rule a title, formula, plain-English text and a known category', () => {
    for (const r of listRules()) {
      expect(r.title, `${r.id} title`).toBeTruthy();
      expect(r.formula, `${r.id} formula`).toBeTruthy();
      expect(r.plainEnglish, `${r.id} plainEnglish`).toBeTruthy();
      expect(Object.keys(RULE_CATEGORIES), `${r.id} category`).toContain(r.category);
      expect(Array.isArray(r.inputs)).toBe(true);
      expect(Array.isArray(r.caveats)).toBe(true);
    }
  });

  it('keys RULES by id and freezes it', () => {
    for (const [id, r] of Object.entries(RULES)) expect(r.id).toBe(id);
    expect(Object.isFrozen(RULES)).toBe(true);
    expect(listRules().length).toBe(Object.keys(RULES).length);
  });

  it('groups every rule into exactly one category', () => {
    const grouped = listRulesByCategory();
    const total = grouped.reduce((n, g) => n + g.rules.length, 0);
    expect(total).toBe(listRules().length);
    for (const g of grouped) expect(g.label).toBe(RULE_CATEGORIES[g.category]);
  });
});
