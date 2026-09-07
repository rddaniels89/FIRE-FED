import { Grid, NumberField, Section } from './fields';
import { spendingSummary } from './summaries';

export default function SpendingSection({ scenario, write, open, onToggle }) {
  const f = scenario.fire;

  return (
    <Section id="spending" title="Spending" summary={spendingSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <NumberField
          id="summary-monthlyExpenses"
          label="Monthly expenses now"
          prefix="$"
          value={scenario.summary.monthlyExpenses}
          min={0}
          step={100}
          onCommit={(v) => write({ summary: { monthlyExpenses: v } })}
        />
        <NumberField
          id="fire-monthlyFireIncomeGoal"
          label="Monthly income goal in retirement"
          prefix="$"
          hint="In today's dollars. The plan inflates it from here."
          value={f.monthlyFireIncomeGoal}
          min={0}
          step={100}
          onCommit={(v) => write({ fire: { monthlyFireIncomeGoal: v } })}
        />
        <NumberField
          id="fire-sideHustleIncome"
          label="Side income per month"
          prefix="$"
          hint="Part-time work, consulting, rental income after you leave."
          value={f.sideHustleIncome}
          min={0}
          step={50}
          onCommit={(v) => write({ fire: { sideHustleIncome: v } })}
        />
        <NumberField
          id="fire-sideHustleEndAge"
          label="Side income ends at age"
          hint="Leave blank if it continues for life."
          value={f.sideHustleEndAge}
          min={scenario.profile.currentAge}
          max={100}
          allowBlank
          placeholder="Never"
          onCommit={(v) => write({ fire: { sideHustleEndAge: v } })}
        />
      </Grid>
    </Section>
  );
}
