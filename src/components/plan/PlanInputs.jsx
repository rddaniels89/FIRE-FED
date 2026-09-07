import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useScenario } from '../../contexts/ScenarioContext';
import { useAuth } from '../../contexts/AuthContext';
import { hasEntitlement } from '../../lib/entitlements';
import YouSection from './inputs/YouSection';
import ServiceSection from './inputs/ServiceSection';
import SavingsSection from './inputs/SavingsSection';
import SpendingSection from './inputs/SpendingSection';
import SocialSecuritySection from './inputs/SocialSecuritySection';
import TaxesSection from './inputs/TaxesSection';
import HealthcareSection from './inputs/HealthcareSection';
import HouseholdSection from './inputs/HouseholdSection';
import StrategiesSection from './inputs/StrategiesSection';
import AssumptionsSection from './inputs/AssumptionsSection';
import PlanEmptyState from './PlanEmptyState';

const SECTIONS = [
  ['you', YouSection],
  ['service', ServiceSection],
  ['savings', SavingsSection],
  ['spending', SpendingSection],
  ['social-security', SocialSecuritySection],
  ['taxes', TaxesSection],
  ['healthcare', HealthcareSection],
  ['household', HouseholdSection],
  ['strategies', StrategiesSection],
  ['assumptions', AssumptionsSection],
];

function ViewPlanLink({ className = '' }) {
  return (
    <Link to="/plan" className={`btn-primary inline-flex items-center gap-2 ${className}`}>
      View my plan
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * The one place every input lives (ROADMAP 57). Each section writes straight
 * to the current scenario; the dashboard, calculators, and compare views all
 * read from the same profile, so nothing is entered twice.
 */
export default function PlanInputs() {
  const { currentScenario, updateCurrentScenario, isLoadingScenarios } = useScenario();
  const { entitlements } = useAuth();
  const [openSections, setOpenSections] = useState({ you: true });

  if (!currentScenario) {
    return (
      <PlanEmptyState
        title="Plan inputs"
        loading={Boolean(isLoadingScenarios)}
        message="No scenario yet. Create one to start entering your inputs."
      />
    );
  }

  const canUse = (feature) => hasEntitlement(entitlements, feature);
  const toggle = (id) => setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  const allOpen = SECTIONS.every(([id]) => openSections[id]);
  const setAll = (open) => setOpenSections(Object.fromEntries(SECTIONS.map(([id]) => [id, open])));

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 mb-4 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold navy-text">Plan inputs</h1>
          <p className="hidden sm:block text-sm text-slate-600 dark:text-slate-400">
            Editing <span className="font-medium">{currentScenario.name}</span>. Changes save as you type.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="focus-ring text-sm text-slate-600 dark:text-slate-300 underline underline-offset-2"
            onClick={() => setAll(!allOpen)}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <ViewPlanLink className="btn-sm" />
        </div>
      </div>

      <p className="mb-4 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        <span>Privacy: FireFed stores ages, not birth dates. No SSN, address, employee ID, or account numbers.</span>
      </p>

      <div className="space-y-4">
        {SECTIONS.map((entry) => {
          const [id, SectionComponent] = entry;
          return (
            <SectionComponent
              key={id}
              scenario={currentScenario}
              write={updateCurrentScenario}
              open={Boolean(openSections[id])}
              onToggle={() => toggle(id)}
              canUse={canUse}
            />
          );
        })}
      </div>

      {/* Two sticky bars ate 176px of a 667px phone viewport, and the header
          already carries the same link, so the bottom bar is desktop-only. */}
      <div className="sticky bottom-0 z-20 -mx-4 px-4 py-3 mt-6 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 hidden sm:flex items-center justify-end">
        <ViewPlanLink />
      </div>
    </div>
  );
}
