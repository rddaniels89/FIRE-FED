import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';

const STORAGE_KEY = 'firefed_onboarding_v1_dismissed';
const PREFS_KEY = 'firefed_onboarding_v1_prefs';
const CHECKLIST_KEY = 'firefed_onboarding_v1_checklist';

const DEFAULT_PREFS = Object.freeze({
  track: 'traditional', // 'traditional' | 'early_exit'
  templateId: 'auto', // 'auto' | template id
});

const DEFAULT_CHECKLIST = Object.freeze({
  templateApplied: false,
  tspReviewed: false,
  fersReviewed: false,
  fireReviewed: false,
  summaryReviewed: false,
  scenariosReviewed: false,
});

const getAgeBandTemplateId = (age) => {
  const n = Number(age);
  if (!Number.isFinite(n)) return 'template_30s';
  if (n < 30) return 'template_20s';
  if (n < 40) return 'template_30s';
  if (n < 50) return 'template_40s';
  return 'template_50s';
};

const safeParseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

function OnboardingCard() {
  const [dismissed, setDismissed] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const { currentScenario, getScenarioTemplates, buildScenarioFromTemplate, updateCurrentScenario } = useScenario();

  useEffect(() => {
    const val = localStorage.getItem(STORAGE_KEY);
    setDismissed(val === 'true');

    const savedPrefs = localStorage.getItem(PREFS_KEY);
    if (savedPrefs) setPrefs(prev => ({ ...prev, ...safeParseJson(savedPrefs, {}) }));

    const savedChecklist = localStorage.getItem(CHECKLIST_KEY);
    if (savedChecklist) setChecklist(prev => ({ ...prev, ...safeParseJson(savedChecklist, {}) }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checklist));
    } catch {
      // ignore
    }
  }, [checklist]);

  const templates = useMemo(() => getScenarioTemplates(), [getScenarioTemplates]);
  const inferredTemplateId = useMemo(() => {
    const age = currentScenario?.tsp?.currentAge ?? currentScenario?.fers?.currentAge;
    return getAgeBandTemplateId(age);
  }, [currentScenario]);

  const selectedTemplateId = prefs.templateId === 'auto' ? inferredTemplateId : prefs.templateId;
  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const orderedSteps = useMemo(() => {
    const base = [
      { key: 'tspReviewed', label: 'TSP Forecast: confirm balance, salary, contributions', to: '/tsp-forecast' },
      { key: 'fersReviewed', label: 'FERS Pension: confirm service + high-3', to: '/fers-pension' },
      { key: 'fireReviewed', label: 'FIRE: confirm target age + income goal', to: '/#fire-planning' },
      { key: 'summaryReviewed', label: 'Summary: sanity-check combined results', to: '/summary' },
      { key: 'scenariosReviewed', label: 'Scenarios: save/duplicate and name your plan', to: '/scenarios' },
    ];

    if (prefs.track === 'early_exit') {
      return [
        base[2],
        base[0],
        base[1],
        base[3],
        base[4],
      ];
    }

    return base;
  }, [prefs.track]);

  if (dismissed) return null;

  return (
    <div className="mb-8 p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold navy-text mb-2">Getting started</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            In a few minutes you can generate a complete retirement summary. Pick your planning track, optionally apply
            a starter template, then follow the checklist.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-5">
            <fieldset className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <legend className="px-2 text-sm font-medium text-slate-700 dark:text-slate-200">Planning track</legend>
              <div className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="onboarding-track"
                    className="mt-0.5"
                    checked={prefs.track === 'traditional'}
                    onChange={() => setPrefs(prev => ({ ...prev, track: 'traditional' }))}
                  />
                  <span>
                    <span className="font-medium">Traditional</span> — optimize around pension eligibility and a classic
                    retirement timeline.
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="onboarding-track"
                    className="mt-0.5"
                    checked={prefs.track === 'early_exit'}
                    onChange={() => setPrefs(prev => ({ ...prev, track: 'early_exit' }))}
                  />
                  <span>
                    <span className="font-medium">Early exit / FIRE</span> — prioritize the bridge years between leaving
                    work and pension start.
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <legend className="px-2 text-sm font-medium text-slate-700 dark:text-slate-200">Starter template</legend>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                This pre-fills common values for your age band. You can still edit everything afterward.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="sr-only" htmlFor="onboarding-template">Choose template</label>
                <select
                  id="onboarding-template"
                  className="focus-ring bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
                  value={prefs.templateId}
                  onChange={(e) => setPrefs(prev => ({ ...prev, templateId: e.target.value }))}
                >
                  <option value="auto">Auto ({inferredTemplateId.replace('template_', '').toUpperCase()})</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    const next = buildScenarioFromTemplate(selectedTemplateId, currentScenario?.name);
                    updateCurrentScenario({
                      tsp: next.tsp,
                      fers: next.fers,
                      fire: next.fire,
                      summary: next.summary,
                      meta: { ...(currentScenario?.meta ?? {}), templateId: selectedTemplateId },
                    });
                    setChecklist(prev => ({ ...prev, templateApplied: true }));
                  }}
                  disabled={!currentScenario}
                >
                  Apply template
                </button>
              </div>
              {selectedTemplate?.description && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Suggested: <span className="font-medium">{selectedTemplate.name}</span> — {selectedTemplate.description}
                </p>
              )}
            </fieldset>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Checklist</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tip: this list is intentionally explicit—check items as you complete them.
                </p>
              </div>
              <button
                type="button"
                className="focus-ring text-xs text-slate-600 dark:text-slate-300 underline underline-offset-2"
                onClick={() => setChecklist(DEFAULT_CHECKLIST)}
              >
                Reset checklist
              </button>
            </div>

            <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checklist.templateApplied}
                  onChange={(e) => setChecklist(prev => ({ ...prev, templateApplied: e.target.checked }))}
                />
                <span>Optional: apply a starter template (above) to speed up setup</span>
              </li>
              {orderedSteps.map((step) => (
                <li key={step.key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(checklist[step.key])}
                    onChange={(e) => setChecklist(prev => ({ ...prev, [step.key]: e.target.checked }))}
                  />
                  <span className="flex-1">
                    {step.label}{' '}
                    <Link
                      to={step.to}
                      className="focus-ring inline-flex items-center text-navy-700 dark:text-navy-300 underline underline-offset-2"
                      onClick={() => {
                        if (step.to === '/#fire-planning') {
                          try {
                            localStorage.setItem('firefed_open_fire_planning', 'true');
                          } catch {
                            // ignore
                          }
                        }
                      }}
                    >
                      Open
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/tsp-forecast" className="btn-primary">Start with TSP</Link>
            <Link to="/fers-pension" className="btn-secondary">Add FERS</Link>
            <Link to="/summary" className="btn-secondary">View Summary</Link>
          </div>
        </div>

        <button
          type="button"
          className="focus-ring text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, 'true');
            setDismissed(true);
          }}
          aria-label="Dismiss onboarding"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default OnboardingCard;


