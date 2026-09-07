import { Grid, NumberField, Section, SelectField } from './fields';
import { CONTRIBUTION_TYPE_OPTIONS } from './options';
import { savingsSummary } from './summaries';

export default function SavingsSection({ scenario, write, open, onToggle }) {
  const t = scenario.tsp;
  const f = scenario.fire;

  return (
    <Section id="savings" title="Savings" summary={savingsSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <NumberField
          id="tsp-currentBalance"
          label="TSP total balance"
          prefix="$"
          value={t.currentBalance}
          min={0}
          step={1000}
          onCommit={(v) => write({ tsp: { currentBalance: v } })}
        />
        <NumberField
          id="tsp-rothBalance"
          label="Of which Roth"
          prefix="$"
          hint="The Roth portion of the balance above."
          value={t.rothBalance}
          min={0}
          max={t.currentBalance}
          step={1000}
          onCommit={(v) => write({ tsp: { rothBalance: v } })}
        />
        <NumberField
          id="tsp-rothContributionBasis"
          label="Roth contribution basis"
          prefix="$"
          hint="Total Roth contributions you have made. Withdrawable tax-free before 59½."
          value={t.rothContributionBasis}
          min={0}
          max={t.rothBalance}
          step={1000}
          onCommit={(v) => write({ tsp: { rothContributionBasis: v } })}
        />
        <NumberField
          id="tsp-monthlyContributionPercent"
          label="Contribution"
          suffix="%"
          hint="Percent of basic pay. The 5% agency match is added automatically."
          value={t.monthlyContributionPercent}
          min={0}
          max={100}
          stepper
          onCommit={(v) => write({ tsp: { monthlyContributionPercent: v } })}
        />
        <SelectField
          id="tsp-contributionType"
          label="Contribution type"
          value={t.contributionType}
          options={CONTRIBUTION_TYPE_OPTIONS}
          onChange={(v) => write({ tsp: { contributionType: v } })}
        />
        <NumberField
          id="fire-taxableBrokerageBalance"
          label="Taxable brokerage balance"
          prefix="$"
          value={f.taxableBrokerageBalance}
          min={0}
          step={1000}
          onCommit={(v) => write({ fire: { taxableBrokerageBalance: v } })}
        />
        <NumberField
          id="fire-cashBalance"
          label="Cash"
          prefix="$"
          hint="Savings, checking, money market."
          value={f.cashBalance}
          min={0}
          step={1000}
          onCommit={(v) => write({ fire: { cashBalance: v } })}
        />
        <NumberField
          id="fire-annualTaxableSavings"
          label="Annual taxable savings"
          prefix="$"
          hint="What you add to brokerage and cash each year, outside the TSP."
          value={f.annualTaxableSavings}
          min={0}
          step={1000}
          onCommit={(v) => write({ fire: { annualTaxableSavings: v } })}
        />
      </Grid>
    </Section>
  );
}
