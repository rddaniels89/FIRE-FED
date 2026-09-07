import { DEFAULT_TRUST_FUND_HAIRCUT } from '../../../lib/calculations/socialSecurity';
import { CheckField, Grid, NumberField, Section, SelectField } from './fields';
import { SS_MODE_OPTIONS as MODE_OPTIONS } from './options';
import { socialSecuritySummary } from './summaries';

export default function SocialSecuritySection({ scenario, write, open, onToggle }) {
  const ss = scenario.summary.socialSecurity;
  const writeSs = (patch) => write({ summary: { socialSecurity: patch } });

  return (
    <Section id="social-security" title="Social Security" summary={socialSecuritySummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <SelectField
          id="ss-mode"
          label="How to model Social Security"
          value={ss.mode}
          options={MODE_OPTIONS}
          hint="Your SSA statement (ssa.gov/myaccount) shows the monthly figure at full retirement age."
          onChange={(v) => writeSs({ mode: v })}
        />
        {ss.mode === 'manual' ? (
          <NumberField
            id="ss-monthlyBenefit"
            label="Monthly benefit at full retirement age"
            prefix="$"
            hint="In today's dollars, before any claim-age adjustment."
            value={ss.monthlyBenefit}
            min={0}
            step={50}
            onCommit={(v) => writeSs({ monthlyBenefit: v })}
          />
        ) : null}
        {ss.mode === 'estimate' ? (
          <NumberField
            id="ss-percentOfSalary"
            label="Percent of salary for the estimate"
            suffix="%"
            hint="Roughly 40% for a median earner, falling toward 25% near the wage base."
            value={ss.percentOfSalary}
            min={0}
            max={100}
            stepper
            onCommit={(v) => writeSs({ percentOfSalary: v })}
          />
        ) : null}
        {ss.mode !== 'not_configured' ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <CheckField
              id="ss-trustFundHaircut"
              label="Model the Trustees' projected cut"
              checked={Boolean(ss.trustFundHaircut)}
              hint={`Reduces benefits by ${DEFAULT_TRUST_FUND_HAIRCUT.percent}% from ${DEFAULT_TRUST_FUND_HAIRCUT.startYear}, when the Trustees project the trust fund reserves run out. Congress may act first.`}
              onChange={(v) => writeSs({ trustFundHaircut: v ? { ...DEFAULT_TRUST_FUND_HAIRCUT } : null })}
            />
          </div>
        ) : null}
      </Grid>
    </Section>
  );
}
