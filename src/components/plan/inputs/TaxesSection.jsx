import { CheckField, Grid, Section, SelectField } from './fields';
import { FILING_OPTIONS, STATE_OPTIONS, findStatePreset as findPreset } from './options';
import { taxesSummary } from './summaries';

export default function TaxesSection({ scenario, write, open, onToggle }) {
  const t = scenario.taxes;
  const preset = findPreset(t.state?.code);

  return (
    <Section id="taxes" title="Taxes" summary={taxesSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <SelectField
          id="taxes-filingStatus"
          label="Filing status"
          value={t.filingStatus}
          options={FILING_OPTIONS}
          onChange={(v) => write({ taxes: { filingStatus: v } })}
        />
        <div className="sm:col-span-1 lg:col-span-2">
          <SelectField
            id="taxes-state"
            label="State"
            value={preset.code}
            options={STATE_OPTIONS}
            onChange={(code) => {
              const next = findPreset(code);
              write({
                taxes: {
                  state: {
                    code: next.code,
                    rate: next.rate,
                    exemptsFederalPension: next.exemptsFederalPension,
                    exemptsSocialSecurity: next.exemptsSocialSecurity,
                    pensionExclusion: next.pensionExclusion,
                  },
                },
              });
            }}
          />
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-2" data-testid="state-tax-notes">
            {preset.notes}
            {preset.code !== 'NONE' ? ' Planning approximation; verify against your state’s current instructions.' : ''}
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <CheckField
            id="taxes-includeStateTax"
            label="Include state income tax in the plan"
            checked={t.includeStateTax}
            hint="Turn off to see federal tax only, for example if you plan to move."
            onChange={(v) => write({ taxes: { includeStateTax: v } })}
          />
        </div>
      </Grid>
    </Section>
  );
}
