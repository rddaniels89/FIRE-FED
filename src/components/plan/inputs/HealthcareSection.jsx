import { OTHER_COVERAGE_TYPES } from '../../../lib/calculations/healthcareCosts';
import { FEATURES } from '../../../lib/entitlements';
import { CheckField, Grid, NumberField, ProBadge, ProNotice, Section, SelectField } from './fields';
import { pct } from './format';
import { ENROLLMENT_OPTIONS, OTHER_COVERAGE_OPTIONS } from './options';
import { healthcareSummary } from './summaries';

export default function HealthcareSection({ scenario, write, open, onToggle, canUse }) {
  const h = scenario.healthcare;
  const writeHc = (patch) => write({ healthcare: patch });
  const irmaaAllowed = canUse(FEATURES.IRMAA);

  return (
    <Section id="healthcare" title="Healthcare" summary={healthcareSummary(scenario)} open={open} onToggle={onToggle}>
      <Grid>
        <div className="sm:col-span-2 lg:col-span-3">
          <CheckField
            id="hc-fehbEnrolled"
            label="Enrolled in FEHB"
            checked={h.fehbEnrolled}
            hint="Keeping FEHB into retirement requires five years of continuous enrollment (or enrollment since your first opportunity) before you retire on an immediate annuity."
            onChange={(v) => writeHc({ fehbEnrolled: v })}
          />
        </div>
        {h.fehbEnrolled ? (
          <>
            <SelectField
              id="hc-fehbEnrollmentType"
              label="Enrollment type"
              value={h.fehbEnrollmentType}
              options={ENROLLMENT_OPTIONS}
              onChange={(v) => writeHc({ fehbEnrollmentType: v })}
            />
            <NumberField
              id="hc-fehbAnnualEnrolleeShare"
              label="Annual enrollee share"
              prefix="$"
              hint="Your share of the premium per year. Leave blank to use the program-wide average for your enrollment type."
              value={h.fehbAnnualEnrolleeShare}
              min={0}
              step={100}
              allowBlank
              placeholder="Default"
              onCommit={(v) => writeHc({ fehbAnnualEnrolleeShare: v })}
            />
            <NumberField
              id="hc-fehbYearsEnrolled"
              label="Years enrolled so far"
              value={h.fehbYearsEnrolled}
              min={0}
              max={60}
              stepper
              onCommit={(v) => writeHc({ fehbYearsEnrolled: v })}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <CheckField
                id="hc-enrolledSinceFirstOpportunity"
                label="Enrolled since my first opportunity"
                checked={h.enrolledSinceFirstOpportunity}
                hint="Satisfies the five-year rule regardless of how many years that has been."
                onChange={(v) => writeHc({ enrolledSinceFirstOpportunity: v })}
              />
            </div>
            <NumberField
              id="hc-tricareYears"
              label="TRICARE years"
              hint="Years of TRICARE coverage count toward the FEHB five-year rule."
              value={h.tricareYears}
              min={0}
              max={60}
              stepper
              onCommit={(v) => writeHc({ tricareYears: v })}
            />
            <NumberField
              id="hc-premiumGrowthPercent"
              label="Premium growth"
              suffix="%"
              hint="Per year. FEHB premiums have grown faster than general inflation."
              value={h.premiumGrowthPercent}
              min={0}
              max={20}
              step={0.5}
              stepper
              onCommit={(v) => writeHc({ premiumGrowthPercent: v })}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <CheckField
                id="hc-keepFehbWithMedicare"
                label="Keep FEHB after Medicare eligibility at 65"
                checked={h.keepFehbWithMedicare}
                onChange={(v) => writeHc({ keepFehbWithMedicare: v })}
              />
            </div>
          </>
        ) : (
          <NumberField
            id="hc-marketplaceAnnualPremium"
            label="Marketplace premium per year"
            prefix="$"
            hint="Before Medicare. Leave blank to use a national benchmark for your enrollment type."
            value={h.marketplaceAnnualPremium}
            min={0}
            step={100}
            allowBlank
            placeholder="Default"
            onCommit={(v) => writeHc({ marketplaceAnnualPremium: v })}
          />
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <CheckField
            id="hc-enrollInPartB"
            label="Enroll in Medicare Part B at 65"
            checked={h.enrollInPartB}
            hint="Adds the Part B premium from 65 on."
            onChange={(v) => writeHc({ enrollInPartB: v })}
          />
        </div>
        <SelectField
          id="hc-otherCoverage"
          label="Other coverage"
          value={h.otherCoverage}
          options={OTHER_COVERAGE_OPTIONS}
          onChange={(v) => writeHc({ otherCoverage: v })}
        />
        {h.otherCoverage !== OTHER_COVERAGE_TYPES.NONE ? (
          <NumberField
            id="hc-otherCoverageAnnualCost"
            label="Other coverage cost per year"
            prefix="$"
            value={h.otherCoverageAnnualCost}
            min={0}
            step={100}
            onCommit={(v) => writeHc({ otherCoverageAnnualCost: v })}
          />
        ) : null}
        <NumberField
          id="hc-outOfPocketAnnual"
          label="Out-of-pocket per year"
          prefix="$"
          hint="Deductibles, copays, dental, vision."
          value={h.outOfPocketAnnual}
          min={0}
          step={100}
          onCommit={(v) => writeHc({ outOfPocketAnnual: v })}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          {!irmaaAllowed ? (
            <ProNotice reason="irmaa_pro">
              <ProBadge /> Medicare IRMAA surcharges are a Pro feature.
            </ProNotice>
          ) : null}
          <CheckField
            id="hc-includeIrmaa"
            label="Include IRMAA"
            checked={h.includeIrmaa}
            disabled={!irmaaAllowed}
            hint={`Adds the income-related Part B and Part D surcharge when your modified AGI two years earlier crosses the thresholds. Premium growth: ${pct(h.premiumGrowthPercent)}/yr.`}
            onChange={(v) => writeHc({ includeIrmaa: v })}
          />
        </div>
      </Grid>
    </Section>
  );
}
