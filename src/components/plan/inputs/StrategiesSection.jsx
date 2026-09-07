import { FEATURES } from '../../../lib/entitlements';
import { CheckField, Grid, NumberField, ProBadge, ProNotice, Section, SelectField } from './fields';
import { fractionToPercent, percentToFraction } from './format';
import { BRACKET_OPTIONS } from './options';
import { strategiesSummary } from './summaries';

export default function StrategiesSection({ scenario, write, open, onToggle, canUse }) {
  const allowed = canUse(FEATURES.BRIDGE_STRATEGIES);
  const s = scenario.strategies;

  return (
    <Section
      id="strategies"
      title="Strategies"
      badge={allowed ? null : <ProBadge />}
      summary={strategiesSummary(scenario, allowed)}
      open={open}
      onToggle={onToggle}
    >
      {!allowed ? (
        <ProNotice reason="bridge_strategies_pro">
          72(t) payments and a Roth conversion ladder can fund the years before 59½. Available with Pro.
        </ProNotice>
      ) : null}
      <fieldset disabled={!allowed} className="min-w-0 disabled:opacity-60">
        <Grid>
          <div className="sm:col-span-2 lg:col-span-3">
            <CheckField
              id="strat-sepp-enabled"
              label="Use 72(t) substantially equal periodic payments"
              checked={s.sepp?.enabled}
              disabled={!allowed}
              hint="Penalty-free TSP or IRA withdrawals before 59½, fixed for five years or until 59½, whichever is later."
              onChange={(v) => write({ strategies: { sepp: { enabled: v } } })}
            />
          </div>
          {s.sepp?.enabled ? (
            <NumberField
              id="strat-sepp-rate"
              label="72(t) interest rate"
              suffix="%"
              hint="The IRS allows up to 5% or 120% of the federal mid-term rate, whichever is higher."
              value={fractionToPercent(s.sepp.interestRate)}
              min={0}
              max={10}
              step={0.25}
              stepper
              disabled={!allowed}
              onCommit={(v) => write({ strategies: { sepp: { interestRate: percentToFraction(v) } } })}
            />
          ) : null}
          <div className="sm:col-span-2 lg:col-span-3">
            <CheckField
              id="strat-roth-enabled"
              label="Use a Roth conversion ladder"
              checked={s.rothConversion?.enabled}
              disabled={!allowed}
              hint="Convert traditional TSP to Roth each year up to a target bracket; each conversion is withdrawable penalty-free after five years."
              onChange={(v) => write({ strategies: { rothConversion: { enabled: v } } })}
            />
          </div>
          {s.rothConversion?.enabled ? (
            <SelectField
              id="strat-roth-bracket"
              label="Target bracket"
              value={String(s.rothConversion.targetBracketRate)}
              options={BRACKET_OPTIONS}
              disabled={!allowed}
              onChange={(v) => write({ strategies: { rothConversion: { targetBracketRate: Number(v) } } })}
            />
          ) : null}
        </Grid>
      </fieldset>
    </Section>
  );
}
