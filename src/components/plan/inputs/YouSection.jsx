import { getFersContributionRate } from '../../../lib/calculations/fers';
import {
  SS_EARLIEST_CLAIM_AGE,
  SS_LATEST_CLAIM_AGE,
  estimatePiaFromSalary,
  socialSecurityByClaimAge,
} from '../../../lib/calculations/socialSecurity';
import { birthYearFromAgeAndMonths } from '../../../lib/calculations/mra';
import { CheckField, Grid, NumberField, RadioField, Section, SelectField } from './fields';
import { money, pct } from './format';
import { COHORT_OPTIONS, EMPLOYEE_TYPE_OPTIONS, PATH_OPTIONS } from './options';
import { youSummary } from './summaries';

/** The PIA the claim-age menu prices from, or 0 when Social Security is not configured. */
function resolvePia(scenario) {
  const ss = scenario.summary?.socialSecurity ?? {};
  if (ss.mode === 'manual') return Number(ss.monthlyBenefit) || 0;
  if (ss.mode === 'estimate') {
    return estimatePiaFromSalary({ annualSalary: scenario.tsp?.annualSalary, replacementPercent: ss.percentOfSalary });
  }
  return 0;
}

export default function YouSection({ scenario, write, open, onToggle }) {
  const p = scenario.profile;
  const writeProfile = (patch) => write({ profile: patch });

  const pia = resolvePia(scenario);
  const rows = pia > 0
    ? socialSecurityByClaimAge({ piaMonthlyAtFra: pia, birthYear: birthYearFromAgeAndMonths({ currentAge: p.currentAge, currentAgeMonths: p.currentAgeMonths }) })
    : null;
  const claimOptions = [];
  for (let age = SS_EARLIEST_CLAIM_AGE; age <= SS_LATEST_CLAIM_AGE; age += 1) {
    const row = rows?.find((r) => r.claimAge === age);
    claimOptions.push({ value: age, label: row ? `${age} — ${money(row.monthly)}/mo` : String(age) });
  }

  const annuityMode = p.annuityStartAge == null ? 'default' : 'choose';
  const contributionRate = getFersContributionRate(p.hireCohort);

  return (
    <Section id="you" title="You" summary={youSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <NumberField
          id="profile-currentAge"
          label="Current age"
          hint="Years and months since your last birthday. The months settle which year you were born, which is what sets your minimum retirement age."
          value={p.currentAge}
          min={16}
          max={100}
          stepper
          onCommit={(v) => writeProfile({ currentAge: v })}
        />
        <NumberField
          id="profile-currentAgeMonths"
          label="…and months"
          suffix="months"
          hint="0 to 11, since your last birthday."
          value={p.currentAgeMonths ?? 0}
          min={0}
          max={11}
          stepper
          onCommit={(v) => writeProfile({ currentAgeMonths: v })}
        />
        <CheckField
          id="profile-bornOnJanuaryFirst"
          label="I was born on 1 January"
          hint="OPM and the Social Security Administration both count a 1 January birthday as the previous year. FireFed does not ask for your birth date, so tell it here."
          checked={Boolean(p.bornOnJanuaryFirst)}
          onChange={(checked) => writeProfile({ bornOnJanuaryFirst: checked })}
        />
        <NumberField
          id="profile-separationAge"
          label="Separation age"
          hint="When federal employment ends. Not necessarily when the pension starts."
          value={p.separationAge}
          min={p.currentAge}
          max={100}
          stepper
          onCommit={(v) => writeProfile({ separationAge: v })}
        />
        <div className="space-y-3">
          <RadioField
            name="annuity-start"
            label="Annuity start"
            value={annuityMode}
            onChange={(mode) =>
              writeProfile({ annuityStartAge: mode === 'default' ? null : Math.max(p.separationAge, 62) })
            }
            options={[
              { value: 'default', label: 'Start with separation (path default)' },
              { value: 'choose', label: 'Choose an age' },
            ]}
          />
          {annuityMode === 'choose' ? (
            <NumberField
              id="profile-annuityStartAge"
              label="Annuity start age"
              value={p.annuityStartAge}
              min={p.separationAge}
              max={100}
              stepper
              onCommit={(v) => writeProfile({ annuityStartAge: v })}
            />
          ) : null}
        </div>
        <SelectField
          id="profile-socialSecurityClaimAge"
          label="Social Security claim age"
          value={p.socialSecurityClaimAge}
          options={claimOptions}
          hint={rows ? 'Monthly benefit at each claim age, from your figure in the Social Security section.' : 'Enter a Social Security figure below to see the monthly benefit at each age.'}
          onChange={(v) => writeProfile({ socialSecurityClaimAge: Number(v) })}
        />
        <SelectField
          id="profile-retirementPath"
          label="Retirement path"
          value={p.retirementPath}
          options={PATH_OPTIONS}
          hint="Auto picks the best path you qualify for at your separation age."
          onChange={(v) => writeProfile({ retirementPath: v })}
        />
        <SelectField
          id="profile-employeeType"
          label="Employee type"
          value={p.employeeType}
          options={EMPLOYEE_TYPE_OPTIONS}
          hint="Special provision employees have an enhanced multiplier and earlier eligibility."
          onChange={(v) => writeProfile({ employeeType: v })}
        />
        <SelectField
          id="profile-hireCohort"
          label="Hire cohort"
          value={p.hireCohort}
          options={COHORT_OPTIONS}
          hint={`Sets your FERS contribution rate (${pct(contributionRate * 100)} of basic pay). It does not change the pension formula.`}
          onChange={(v) => writeProfile({ hireCohort: v })}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <CheckField
            id="profile-isVeraOffered"
            label="My agency has offered an early out (VERA)"
            checked={p.isVeraOffered}
            hint="A what-if, not a choice: VERA only exists when your agency offers it. Leave this unchecked unless you have an offer in hand."
            onChange={(v) => writeProfile({ isVeraOffered: v })}
          />
        </div>
      </Grid>
    </Section>
  );
}
