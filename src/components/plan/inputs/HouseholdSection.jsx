import { FEATURES } from '../../../lib/entitlements';
import { CheckField, Field, Grid, NumberField, ProBadge, ProNotice, RadioField, Section, SelectField } from './fields';
import { COHORT_OPTIONS } from './options';
import { householdSummary } from './summaries';

export default function HouseholdSection({ scenario, write, open, onToggle, canUse }) {
  const allowed = canUse(FEATURES.HOUSEHOLD);
  const s = scenario.household.spouse;
  const writeSpouse = (patch) => write({ household: { spouse: patch } });
  const writeSpouseFers = (patch) => writeSpouse({ fers: patch });
  const spouseAnnuityMode = s.fers.annuityStartAge == null ? 'default' : 'choose';

  return (
    <Section
      id="household"
      title="Household"
      badge={allowed ? null : <ProBadge />}
      summary={householdSummary(scenario, allowed)}
      open={open}
      onToggle={onToggle}
    >
      {!allowed ? (
        <ProNotice reason="household_pro">
          Model a spouse or partner, including a second federal pension, with Pro.
        </ProNotice>
      ) : null}
      <fieldset disabled={!allowed} className="min-w-0 disabled:opacity-60">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          No names are required. The label is only used to tell the two people apart on the plan.
        </p>
        <Grid>
          <div className="sm:col-span-2 lg:col-span-3">
            <CheckField
              id="spouse-enabled"
              label="Include a spouse or partner in the plan"
              checked={s.enabled}
              disabled={!allowed}
              onChange={(v) => writeSpouse({ enabled: v })}
            />
          </div>
          {s.enabled ? (
            <>
              <Field id="spouse-label" label="Label">
                <input
                  id="spouse-label"
                  type="text"
                  className="input-field w-full"
                  defaultValue={s.label}
                  placeholder="Person B"
                  disabled={!allowed}
                  onBlur={(e) => writeSpouse({ label: e.target.value.trim() || 'Person B' })}
                />
              </Field>
              <NumberField
                id="spouse-currentAge"
                label="Age"
                value={s.currentAge}
                min={16}
                max={100}
                stepper
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ currentAge: v })}
              />
              <NumberField
                id="spouse-annualIncome"
                label="Annual income"
                prefix="$"
                value={s.annualIncome}
                min={0}
                step={1000}
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ annualIncome: v })}
              />
              <NumberField
                id="spouse-incomeEndAge"
                label="Income ends at age"
                hint="Leave blank if it never ends."
                value={s.incomeEndAge}
                min={s.currentAge}
                max={100}
                allowBlank
                placeholder="Never"
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ incomeEndAge: v })}
              />
              <NumberField
                id="spouse-ssPia"
                label="Social Security at full retirement age"
                prefix="$"
                hint="Monthly, from their SSA statement."
                value={s.socialSecurity.piaMonthlyAtFra}
                min={0}
                step={50}
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ socialSecurity: { piaMonthlyAtFra: v } })}
              />
              <NumberField
                id="spouse-ssClaimAge"
                label="Social Security claim age"
                value={s.socialSecurity.claimAge}
                min={62}
                max={70}
                stepper
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ socialSecurity: { claimAge: v } })}
              />
              <NumberField
                id="spouse-pensionAnnual"
                label="Pension per year"
                prefix="$"
                hint="A non-federal pension. Use the federal block below for FERS."
                value={s.pensionAnnual}
                min={0}
                step={1000}
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ pensionAnnual: v })}
              />
              <NumberField
                id="spouse-pensionStartAge"
                label="Pension starts at age"
                value={s.pensionStartAge}
                min={s.currentAge}
                max={100}
                stepper
                disabled={!allowed}
                onCommit={(v) => writeSpouse({ pensionStartAge: v })}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <CheckField
                  id="spouse-isFederal"
                  label="Spouse is a federal employee"
                  checked={s.isFederal}
                  disabled={!allowed}
                  hint="Adds a second FERS annuity and supplement to the household."
                  onChange={(v) => writeSpouse({ isFederal: v })}
                />
              </div>
              {s.isFederal ? (
                <>
                  <NumberField
                    id="spouse-fers-years"
                    label="Their years of service"
                    value={s.fers.yearsOfService}
                    min={0}
                    max={50}
                    stepper
                    disabled={!allowed}
                    onCommit={(v) => writeSpouseFers({ yearsOfService: v })}
                  />
                  <NumberField
                    id="spouse-fers-months"
                    label="Their additional months"
                    value={s.fers.monthsOfService}
                    min={0}
                    max={11}
                    stepper
                    disabled={!allowed}
                    onCommit={(v) => writeSpouseFers({ monthsOfService: v })}
                  />
                  <NumberField
                    id="spouse-fers-high3"
                    label="Their High-3"
                    prefix="$"
                    value={s.fers.high3Salary}
                    min={0}
                    step={1000}
                    disabled={!allowed}
                    onCommit={(v) => writeSpouseFers({ high3Salary: v })}
                  />
                  <NumberField
                    id="spouse-fers-separationAge"
                    label="Their separation age"
                    value={s.fers.separationAge}
                    min={s.currentAge}
                    max={100}
                    stepper
                    disabled={!allowed}
                    onCommit={(v) => writeSpouseFers({ separationAge: v })}
                  />
                  <div className="space-y-3">
                    <RadioField
                      name="spouse-annuity-start"
                      label="Their annuity start"
                      value={spouseAnnuityMode}
                      disabled={!allowed}
                      onChange={(mode) =>
                        writeSpouseFers({ annuityStartAge: mode === 'default' ? null : Math.max(s.fers.separationAge, 62) })
                      }
                      options={[
                        { value: 'default', label: 'Start with separation (path default)' },
                        { value: 'choose', label: 'Choose an age' },
                      ]}
                    />
                    {spouseAnnuityMode === 'choose' ? (
                      <NumberField
                        id="spouse-fers-annuityStartAge"
                        label="Their annuity start age"
                        value={s.fers.annuityStartAge}
                        min={s.fers.separationAge}
                        max={100}
                        stepper
                        disabled={!allowed}
                        onCommit={(v) => writeSpouseFers({ annuityStartAge: v })}
                      />
                    ) : null}
                  </div>
                  <SelectField
                    id="spouse-fers-hireCohort"
                    label="Their hire cohort"
                    value={s.fers.hireCohort}
                    options={COHORT_OPTIONS}
                    disabled={!allowed}
                    onChange={(v) => writeSpouseFers({ hireCohort: v })}
                  />
                  <NumberField
                    id="spouse-fers-sickLeave"
                    label="Their unused sick leave"
                    suffix="hrs"
                    value={s.fers.unusedSickLeaveHours}
                    min={0}
                    step={8}
                    disabled={!allowed}
                    onCommit={(v) => writeSpouseFers({ unusedSickLeaveHours: v })}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Grid>
      </fieldset>
    </Section>
  );
}
