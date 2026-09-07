import { ANNUAL_LEAVE_CARRYOVER_CAP_HOURS } from '../../../lib/calculations/fers';
import { CheckField, Grid, NumberField, Section, SelectField } from './fields';
import { SURVIVOR_OPTIONS } from './options';
import { serviceSummary } from './summaries';

export default function ServiceSection({ scenario, write, open, onToggle }) {
  const f = scenario.fers;
  const t = scenario.tsp;

  return (
    <Section id="service" title="Service and pay" summary={serviceSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <NumberField
          id="fers-yearsOfService"
          label="Years of service"
          value={f.yearsOfService}
          min={0}
          max={50}
          stepper
          onCommit={(v) => write({ fers: { yearsOfService: v } })}
        />
        <NumberField
          id="fers-monthsOfService"
          label="Additional months"
          value={f.monthsOfService}
          min={0}
          max={11}
          stepper
          onCommit={(v) => write({ fers: { monthsOfService: v } })}
        />
        <NumberField
          id="fers-high3Salary"
          label="High-3 average salary"
          prefix="$"
          hint="Average of your highest three consecutive years of basic pay. Leave blank to use your current salary."
          value={f.high3Salary}
          min={0}
          step={1000}
          allowBlank
          onCommit={(v) => write({ fers: { high3Salary: v == null ? t.annualSalary : v } })}
        />
        <NumberField
          id="tsp-annualSalary"
          label="Current salary"
          prefix="$"
          value={t.annualSalary}
          min={0}
          step={1000}
          onCommit={(v) => write({ tsp: { annualSalary: v } })}
        />
        <NumberField
          id="tsp-annualSalaryGrowthRate"
          label="Salary growth"
          suffix="%"
          hint="Raises plus step increases, per year."
          value={t.annualSalaryGrowthRate}
          min={0}
          max={20}
          step={0.5}
          stepper
          onCommit={(v) => write({ tsp: { annualSalaryGrowthRate: v } })}
        />
        <NumberField
          id="fers-unusedSickLeaveHours"
          label="Unused sick leave"
          suffix="hrs"
          hint="Credited as extra service in the pension formula (2,087 hours = one year)."
          value={f.unusedSickLeaveHours}
          min={0}
          step={8}
          onCommit={(v) => write({ fers: { unusedSickLeaveHours: v } })}
        />
        <NumberField
          id="fers-annualLeaveHoursAtSeparation"
          label="Annual leave at separation"
          suffix="hrs"
          hint={`Paid as a lump sum when you leave. Most employees can carry over at most ${ANNUAL_LEAVE_CARRYOVER_CAP_HOURS} hours into a new year.`}
          value={f.annualLeaveHoursAtSeparation}
          min={0}
          step={8}
          onCommit={(v) => write({ fers: { annualLeaveHoursAtSeparation: v } })}
        />
        <SelectField
          id="fers-survivorElection"
          label="Survivor election"
          value={f.survivorElection}
          options={SURVIVOR_OPTIONS}
          onChange={(v) => write({ fers: { survivorElection: v } })}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <CheckField
            id="fers-takeRefundOfContributions"
            label="Take a refund of FERS contributions instead of a deferred annuity"
            checked={f.takeRefundOfContributions}
            hint="Only matters when no immediate annuity is available at separation. A refund returns what you paid in (with interest) and gives up the deferred pension for that service."
            onChange={(v) => write({ fers: { takeRefundOfContributions: v } })}
          />
        </div>
      </Grid>
    </Section>
  );
}
