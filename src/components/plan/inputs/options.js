/** Option lists shared by the input sections and their collapsed summaries. */

import { FERS_HIRE_COHORT_LABELS, SURVIVOR_ELECTIONS } from '../../../lib/calculations/fers';
import { SPECIAL_PROVISION_LABELS } from '../../../lib/calculations/specialProvisions';
import { PATH_LABELS } from '../../../lib/calculations/retirementPaths';
import { FEHB_ENROLLMENT_TYPES, OTHER_COVERAGE_TYPES } from '../../../lib/calculations/healthcareCosts';
import { FILING_STATUSES, RETIREMENT_PATH_AUTO } from '../../../lib/scenarios/schema';
import { STATE_TAX_PRESETS } from '../../../lib/taxes/stateIncomeTax';
import { pct } from './format';

export const EMPLOYEE_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular FERS employee' },
  ...Object.entries(SPECIAL_PROVISION_LABELS).map(([value, label]) => ({ value, label })),
];

export const PATH_OPTIONS = [
  { value: RETIREMENT_PATH_AUTO, label: 'Auto (best available path at separation)' },
  ...Object.entries(PATH_LABELS).map(([value, label]) => ({ value, label })),
];

export const COHORT_OPTIONS = Object.entries(FERS_HIRE_COHORT_LABELS).map(([value, label]) => ({ value, label }));

export const SURVIVOR_OPTIONS = [
  { value: SURVIVOR_ELECTIONS.NONE, label: 'None' },
  { value: SURVIVOR_ELECTIONS.PARTIAL, label: 'Partial — 25% to survivor, 5% reduction' },
  { value: SURVIVOR_ELECTIONS.FULL, label: 'Full — 50% to survivor, 10% reduction' },
];

export const SURVIVOR_SHORT = {
  [SURVIVOR_ELECTIONS.NONE]: 'no survivor benefit',
  [SURVIVOR_ELECTIONS.PARTIAL]: 'partial survivor',
  [SURVIVOR_ELECTIONS.FULL]: 'full survivor',
};

export const CONTRIBUTION_TYPE_OPTIONS = [
  { value: 'traditional', label: 'Traditional (pre-tax)' },
  { value: 'roth', label: 'Roth (after-tax)' },
];

export const SS_MODE_OPTIONS = [
  { value: 'not_configured', label: 'Not modeled' },
  { value: 'estimate', label: 'Estimate from my salary' },
  { value: 'manual', label: 'Enter my SSA statement figure' },
];

export const FILING_OPTIONS = [
  { value: FILING_STATUSES.SINGLE, label: 'Single' },
  { value: FILING_STATUSES.MARRIED_JOINT, label: 'Married filing jointly' },
  { value: FILING_STATUSES.MARRIED_SEPARATE, label: 'Married filing separately' },
  { value: FILING_STATUSES.HEAD_OF_HOUSEHOLD, label: 'Head of household' },
];

export const NO_STATE_PRESET = Object.freeze({
  code: 'NONE',
  name: 'None / not modeled',
  rate: 0,
  exemptsFederalPension: false,
  exemptsSocialSecurity: true,
  pensionExclusion: 0,
  notes: 'State income tax is not modeled. Pick your state to include a planning-level estimate.',
});

export const STATE_OPTIONS = [NO_STATE_PRESET, ...STATE_TAX_PRESETS].map((s) => ({ value: s.code, label: s.name }));

export const findStatePreset = (code) => STATE_TAX_PRESETS.find((s) => s.code === code) ?? NO_STATE_PRESET;

export const ENROLLMENT_OPTIONS = [
  { value: FEHB_ENROLLMENT_TYPES.SELF, label: 'Self only' },
  { value: FEHB_ENROLLMENT_TYPES.SELF_PLUS_ONE, label: 'Self plus one' },
  { value: FEHB_ENROLLMENT_TYPES.FAMILY, label: 'Self and family' },
];

export const OTHER_COVERAGE_OPTIONS = [
  { value: OTHER_COVERAGE_TYPES.NONE, label: 'None' },
  { value: OTHER_COVERAGE_TYPES.VA, label: 'VA health care' },
  { value: OTHER_COVERAGE_TYPES.TRICARE, label: 'TRICARE' },
  { value: OTHER_COVERAGE_TYPES.CHAMPVA, label: 'CHAMPVA' },
];

export const BRACKET_OPTIONS = [0.1, 0.12, 0.22, 0.24].map((rate) => ({
  value: String(rate),
  label: `Fill the ${pct(rate * 100, 0)} bracket`,
}));

export const labelFor = (options, value) => options.find((o) => o.value === value)?.label ?? String(value);
