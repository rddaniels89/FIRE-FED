import { CheckField, Grid, NumberField, Section } from './fields';
import { fractionToPercent, percentToFraction } from './format';
import { assumptionsSummary } from './summaries';

export default function AssumptionsSection({ scenario, write, open, onToggle }) {
  const a = scenario.summary.assumptions;

  return (
    <Section id="assumptions" title="Assumptions" summary={assumptionsSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <NumberField
          id="tsp-inflationRate"
          label="Inflation"
          suffix="%"
          hint="Per year. Also drives the FERS and Social Security cost-of-living adjustments."
          value={scenario.tsp.inflationRate}
          min={0}
          max={15}
          step={0.5}
          stepper
          onCommit={(v) => write({ tsp: { inflationRate: v } })}
        />
        <NumberField
          id="assumptions-endAge"
          label="Plan end age"
          hint="How long the money has to last."
          value={a.endAge}
          min={Math.max(scenario.profile.separationAge, 60)}
          max={110}
          stepper
          onCommit={(v) => write({ summary: { assumptions: { endAge: v } } })}
        />
        <NumberField
          id="assumptions-expectedReturnPercent"
          label="Expected return override"
          suffix="%"
          hint="Leave blank to derive the return from your TSP fund allocation."
          value={a.expectedReturnPercent}
          min={-10}
          max={20}
          step={0.5}
          allowBlank
          placeholder="From allocation"
          onCommit={(v) => write({ summary: { assumptions: { expectedReturnPercent: v } } })}
        />
        <NumberField
          id="assumptions-safeWithdrawalRate"
          label="Safe withdrawal rate"
          suffix="%"
          hint="The classic figure is 4%; early retirees often plan on 3.25 to 3.5%."
          value={fractionToPercent(a.safeWithdrawalRate)}
          min={1}
          max={10}
          step={0.25}
          stepper
          onCommit={(v) => write({ summary: { assumptions: { safeWithdrawalRate: percentToFraction(v) } } })}
        />
        <CheckField
          id="assumptions-saveWorkingSurplus"
          label="Keep working-year surplus as cash"
          hint="Take-home pay left after spending and contributions is saved. Turn off to treat it as spent."
          checked={a.saveWorkingSurplus !== false}
          onChange={(checked) => write({ summary: { assumptions: { saveWorkingSurplus: checked } } })}
        />
      </Grid>
    </Section>
  );
}
