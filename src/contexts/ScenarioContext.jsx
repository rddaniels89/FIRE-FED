import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { DEFAULT_FREE_SCENARIO_LIMIT } from '../lib/entitlements';
import { trackEvent } from '../lib/telemetry';

const ScenarioContext = createContext();

const SCENARIO_SCHEMA_VERSION = 2;

const SCENARIO_TEMPLATES = Object.freeze([
  {
    id: 'template_20s',
    name: 'Starter (20s)',
    description: 'Early career baseline with modest TSP savings and high growth runway.',
    overrides: {
      tsp: { currentAge: 27, retirementAge: 62, currentBalance: 15000, annualSalary: 70000, monthlyContributionPercent: 10 },
      fers: { currentAge: 27, retirementAge: 62, yearsOfService: 2, monthsOfService: 0, high3Salary: 70000 },
      fire: { desiredFireAge: 50, monthlyFireIncomeGoal: 5500 },
      summary: { monthlyExpenses: 3500 },
    },
  },
  {
    id: 'template_30s',
    name: 'Starter (30s)',
    description: 'Mid-career baseline: stronger salary, meaningful TSP base, and a realistic FIRE target.',
    overrides: {
      tsp: { currentAge: 35, retirementAge: 62, currentBalance: 50000, annualSalary: 90000, monthlyContributionPercent: 12 },
      fers: { currentAge: 35, retirementAge: 62, yearsOfService: 8, monthsOfService: 0, high3Salary: 90000 },
      fire: { desiredFireAge: 55, monthlyFireIncomeGoal: 6000 },
      summary: { monthlyExpenses: 4200 },
    },
  },
  {
    id: 'template_40s',
    name: 'Starter (40s)',
    description: 'Late mid-career: prioritize eligibility timing and bridge planning.',
    overrides: {
      tsp: { currentAge: 45, retirementAge: 62, currentBalance: 160000, annualSalary: 115000, monthlyContributionPercent: 15 },
      fers: { currentAge: 45, retirementAge: 62, yearsOfService: 15, monthsOfService: 0, high3Salary: 115000 },
      fire: { desiredFireAge: 57, monthlyFireIncomeGoal: 7000 },
      summary: { monthlyExpenses: 5200 },
    },
  },
  {
    id: 'template_50s',
    name: 'Starter (50s)',
    description: 'Pre-retirement: focus on “earliest eligible” and near-term cashflow assumptions.',
    overrides: {
      tsp: { currentAge: 55, retirementAge: 62, currentBalance: 350000, annualSalary: 140000, monthlyContributionPercent: 15 },
      fers: { currentAge: 55, retirementAge: 62, yearsOfService: 25, monthsOfService: 0, high3Salary: 140000 },
      fire: { desiredFireAge: 60, monthlyFireIncomeGoal: 8000 },
      summary: { monthlyExpenses: 6500 },
    },
  },
]);

const getValueByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
};

const DIFF_FIELDS = Object.freeze([
  { path: 'tsp.currentAge', label: 'TSP: current age' },
  { path: 'tsp.retirementAge', label: 'TSP: retirement age' },
  { path: 'tsp.currentBalance', label: 'TSP: current balance' },
  { path: 'tsp.monthlyContributionPercent', label: 'TSP: contribution %' },
  { path: 'tsp.annualSalary', label: 'TSP: salary' },
  { path: 'tsp.valueMode', label: 'TSP: real vs nominal' },
  { path: 'fers.currentAge', label: 'FERS: current age' },
  { path: 'fers.retirementAge', label: 'FERS: planned retirement age' },
  { path: 'fers.yearsOfService', label: 'FERS: years of service' },
  { path: 'fers.high3Salary', label: 'FERS: high-3' },
  { path: 'fire.desiredFireAge', label: 'FIRE: desired FIRE age' },
  { path: 'fire.monthlyFireIncomeGoal', label: 'FIRE: income goal (monthly)' },
  { path: 'summary.monthlyExpenses', label: 'Summary: monthly expenses' },
  { path: 'summary.assumptions.safeWithdrawalRate', label: 'Assumptions: SWR' },
]);

export const useScenario = () => {
  const context = useContext(ScenarioContext);
  if (!context) {
    throw new Error('useScenario must be used within a ScenarioProvider');
  }
  return context;
};

export const ScenarioProvider = ({ children }) => {
  const { user, isAuthenticated, entitlements } = useAuth();
  const [scenarios, setScenarios] = useState([]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true);
  const [lastScenarioError, setLastScenarioError] = useState(null);

  const scenarioLimit = entitlements?.scenarioLimit ?? DEFAULT_FREE_SCENARIO_LIMIT;
  const isScenarioLimitReached = Number.isFinite(scenarioLimit) ? scenarios.length >= scenarioLimit : false;

  // Default scenario structure
  const createDefaultScenario = (name = 'New Scenario') => ({
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: Date.now().toString(),
    name,
    createdAt: new Date().toISOString(),
    tsp: {
      currentBalance: 50000,
      currentAge: 35,
      retirementAge: 62,
      monthlyContributionPercent: 10,
      annualSalary: 80000,
      annualSalaryGrowthRate: 3,
      includeEmployerMatch: true,
      includeAutomatic1Percent: true,
      annualEmployeeDeferralLimit: 23500,
      annualCatchUpLimit: 7500,
      catchUpAge: 50,
      inflationRate: 2.5,
      valueMode: 'nominal', // 'nominal' | 'real'
      allocation: {
        G: 10,
        F: 20,
        C: 40,
        S: 20,
        I: 10
      },
      fundReturns: {
        G: 2,
        F: 3,
        C: 7,
        S: 8,
        I: 6,
      },
      contributionType: 'traditional', // 'traditional' or 'roth'
      currentTaxRate: 22,
      retirementTaxRate: 15,
      showComparison: false,
    },
    fers: {
      yearsOfService: 20,
      monthsOfService: 0,
      high3Salary: 85000,
      retirementAge: 62,
      currentAge: 42
    },
    // FIRE-specific fields for FireFed upgrade
    fire: {
      desiredFireAge: 55,
      monthlyFireIncomeGoal: 6000,
      sideHustleIncome: 500,
      spouseIncome: 4000
    },
    summary: {
      monthlyExpenses: 4000,
      socialSecurity: {
        mode: 'not_configured', // 'not_configured' | 'estimate' | 'manual'
        claimingAge: 67,
        monthlyBenefit: 0,
        percentOfSalary: 30,
      },
      assumptions: {
        pensionEndAge: 85,
        safeWithdrawalRate: 0.04,
      },
    }
  });

  const migrateScenarioToLatest = (scenario) => {
    if (!scenario || typeof scenario !== 'object') return scenario;

    // Work on a shallow clone; nested objects are normalized later.
    let s = { ...scenario };
    let version = Number(s.schemaVersion ?? 0);

    // v0 -> v1: ensure schemaVersion exists (normalization handles shape)
    if (version < 1) {
      s.schemaVersion = 1;
      version = 1;
    }

    // v1 -> v2: add metadata + ensure summary.assumptions exists (normalization handles defaults)
    if (version < 2) {
      s = {
        ...s,
        meta: {
          ...(s.meta ?? {}),
          updatedAt: (s.meta && s.meta.updatedAt) ? s.meta.updatedAt : (s.createdAt || new Date().toISOString()),
        },
        schemaVersion: 2,
      };
      version = 2;
    }

    if (!Number.isFinite(version) || version !== SCENARIO_SCHEMA_VERSION) {
      s.schemaVersion = SCENARIO_SCHEMA_VERSION;
    }

    return s;
  };

  const normalizeScenario = (scenario) => {
    const migrated = migrateScenarioToLatest(scenario);
    const base = createDefaultScenario(migrated?.name || 'Scenario');
    const merged = {
      ...base,
      ...migrated,
      tsp: { ...base.tsp, ...(migrated?.tsp ?? {}) },
      fers: { ...base.fers, ...(migrated?.fers ?? {}) },
      fire: { ...base.fire, ...(migrated?.fire ?? {}) },
      summary: {
        ...base.summary,
        ...(migrated?.summary ?? {}),
        socialSecurity: { ...base.summary.socialSecurity, ...(migrated?.summary?.socialSecurity ?? {}) },
        assumptions: { ...base.summary.assumptions, ...(migrated?.summary?.assumptions ?? {}) },
      },
    };

    if (!merged.schemaVersion) merged.schemaVersion = SCENARIO_SCHEMA_VERSION;
    return merged;
  };

  const getScenarioTemplates = () => SCENARIO_TEMPLATES.slice();

  const buildScenarioFromTemplate = (templateId, nameOverride) => {
    const template = SCENARIO_TEMPLATES.find(t => t.id === templateId);
    const base = createDefaultScenario(nameOverride || template?.name || 'New Scenario');
    if (!template) return base;

    return normalizeScenario({
      ...base,
      name: nameOverride || template.name,
      meta: { ...(base.meta ?? {}), templateId: template.id, updatedAt: new Date().toISOString() },
      tsp: { ...base.tsp, ...(template.overrides?.tsp ?? {}) },
      fers: { ...base.fers, ...(template.overrides?.fers ?? {}) },
      fire: { ...base.fire, ...(template.overrides?.fire ?? {}) },
      summary: { ...base.summary, ...(template.overrides?.summary ?? {}) },
    });
  };

  const getScenarioDiff = (fromScenario, toScenario) => {
    if (!fromScenario || !toScenario) return [];

    const diffs = [];
    for (const field of DIFF_FIELDS) {
      const fromValue = getValueByPath(fromScenario, field.path);
      const toValue = getValueByPath(toScenario, field.path);
      const equal = Object.is(fromValue, toValue) || JSON.stringify(fromValue) === JSON.stringify(toValue);
      if (!equal) {
        diffs.push({ ...field, from: fromValue, to: toValue });
      }
    }

    return diffs;
  };

  // Load scenarios when user authentication changes
  useEffect(() => {
    const loadScenarios = async () => {
      setIsLoadingScenarios(true);
      
      if (!isAuthenticated) {
        // Clear scenarios when not authenticated
        setScenarios([]);
        setCurrentScenario(null);
        setIsLoadingScenarios(false);
        return;
      }

      try {
        if (isSupabaseAvailable && user) {
          // Load scenarios from Supabase
          const { data, error } = await supabase
            .from('scenarios')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error loading scenarios from Supabase:', error);
            // Fallback to localStorage
            loadFromLocalStorage();
          } else {
            if (data && data.length > 0) {
              // Convert Supabase format to app format
              const normalizedScenarios = data.map(scenario =>
                normalizeScenario({
                  id: scenario.id,
                  name: scenario.scenario_name,
                  createdAt: scenario.created_at,
                  tsp: scenario.tsp_data,
                  fers: scenario.fers_data,
                  fire: scenario.fire_goal,
                  summary: scenario.summary_data,
                })
              );
              setScenarios(normalizedScenarios);
              setCurrentScenario(normalizedScenarios[0]);
            } else {
              // Create default scenario for new users
              const defaultScenario = createDefaultScenario('My First Scenario');
              setScenarios([defaultScenario]);
              setCurrentScenario(defaultScenario);
              // Save it to Supabase
              await saveScenarioToSupabase(defaultScenario);
            }
          }
        } else {
          // Fallback to localStorage
          loadFromLocalStorage();
        }
      } catch (error) {
        console.error('Error in loadScenarios:', error);
        loadFromLocalStorage();
      } finally {
        setIsLoadingScenarios(false);
      }
    };

    const loadFromLocalStorage = () => {
      const savedScenarios = localStorage.getItem('retirement-scenarios');
      if (savedScenarios) {
        try {
          const parsed = JSON.parse(savedScenarios);
          if (parsed && parsed.length > 0) {
            const normalizedScenarios = parsed.map((scenario) => normalizeScenario(scenario));
            setScenarios(normalizedScenarios);
            setCurrentScenario(normalizedScenarios[0]);
          } else {
            const defaultScenario = createDefaultScenario('Default Scenario');
            setScenarios([defaultScenario]);
            setCurrentScenario(defaultScenario);
          }
        } catch (error) {
          console.error('Error loading scenarios from localStorage:', error);
          const defaultScenario = createDefaultScenario('Default Scenario');
          setScenarios([defaultScenario]);
          setCurrentScenario(defaultScenario);
        }
      } else {
        const defaultScenario = createDefaultScenario('Default Scenario');
        setScenarios([defaultScenario]);
        setCurrentScenario(defaultScenario);
      }
    };

    loadScenarios();
  }, [isAuthenticated, user]);

  // Save scenarios to localStorage whenever they change (fallback)
  useEffect(() => {
    if (!isLoadingScenarios && scenarios.length > 0 && !isSupabaseAvailable) {
      localStorage.setItem('retirement-scenarios', JSON.stringify(scenarios));
    }
  }, [scenarios, isLoadingScenarios]);

  // Helper function to save scenario to Supabase
  const saveScenarioToSupabase = async (scenario) => {
    if (!isSupabaseAvailable || !user) return null;

    try {
      const { data, error } = await supabase
        .from('scenarios')
        .insert([
          {
            user_id: user.id,
            scenario_name: scenario.name,
            tsp_data: scenario.tsp,
            fers_data: scenario.fers,
            fire_goal: scenario.fire,
            summary_data: scenario.summary,
          }
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving scenario to Supabase:', error);
      return null;
    }
  };

  // Helper function to update scenario in Supabase
  const updateScenarioInSupabase = async (scenario) => {
    if (!isSupabaseAvailable || !user) return null;

    try {
      const { data, error } = await supabase
        .from('scenarios')
        .update({
          scenario_name: scenario.name,
          tsp_data: scenario.tsp,
          fers_data: scenario.fers,
          fire_goal: scenario.fire,
          summary_data: scenario.summary,
        })
        .eq('id', scenario.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating scenario in Supabase:', error);
      return null;
    }
  };

  // Helper function to delete scenario from Supabase
  const deleteScenarioFromSupabase = async (scenarioId) => {
    if (!isSupabaseAvailable || !user) return null;

    try {
      const { error } = await supabase
        .from('scenarios')
        .delete()
        .eq('id', scenarioId)
        .eq('user_id', user.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting scenario from Supabase:', error);
      return null;
    }
  };

  const saveScenario = async (name, data) => {
    setLastScenarioError(null);

    if (isScenarioLimitReached) {
      const error = { code: 'SCENARIO_LIMIT', scenarioLimit };
      setLastScenarioError(error);
      trackEvent('scenario_limit_hit', { limit: scenarioLimit });
      return { success: false, error };
    }

    const scenario = normalizeScenario({
      ...data,
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString(),
      meta: { ...(data?.meta ?? {}), updatedAt: new Date().toISOString() },
    });
    
    // Save to Supabase first
    if (isSupabaseAvailable && user) {
      const supabaseResult = await saveScenarioToSupabase(scenario);
      if (supabaseResult) {
        scenario.id = supabaseResult.id; // Use Supabase-generated ID
        scenario.createdAt = supabaseResult.created_at;
      }
    }
    
    setScenarios(prev => [...prev, scenario]);
    setCurrentScenario(scenario);
    trackEvent('scenario_created', { count: scenarios.length + 1 });
    
    // Fallback to localStorage if Supabase not available
    if (!isSupabaseAvailable) {
      localStorage.setItem('retirement-scenarios', JSON.stringify([...scenarios, scenario]));
    }
    
    return scenario;
  };

  const updateCurrentScenario = async (updates) => {
    if (!currentScenario) return;
    
    // Ensure we deep merge the updates properly
    const updatedScenario = normalizeScenario({
      ...currentScenario,
      ...updates,
      tsp: updates.tsp ? { ...currentScenario.tsp, ...updates.tsp } : currentScenario.tsp,
      fers: updates.fers ? { ...currentScenario.fers, ...updates.fers } : currentScenario.fers,
      fire: updates.fire ? { ...currentScenario.fire, ...updates.fire } : currentScenario.fire,
      summary: updates.summary ? { ...currentScenario.summary, ...updates.summary } : currentScenario.summary,
      meta: { ...(currentScenario.meta ?? {}), ...(updates.meta ?? {}), updatedAt: new Date().toISOString() },
    });
    
    setCurrentScenario(updatedScenario);
    
    setScenarios(prev => 
      prev.map(s => s.id === currentScenario.id ? updatedScenario : s)
    );

    // Sync with Supabase if available
    if (isSupabaseAvailable && user) {
      // Debounce updates to avoid too many API calls
      clearTimeout(updateCurrentScenario.timeoutId);
      updateCurrentScenario.timeoutId = setTimeout(async () => {
        await updateScenarioInSupabase(updatedScenario);
      }, 1000); // 1 second debounce
    } else {
      // Update localStorage if Supabase not available
      const updatedScenarios = scenarios.map(s => s.id === currentScenario.id ? updatedScenario : s);
      localStorage.setItem('retirement-scenarios', JSON.stringify(updatedScenarios));
    }
  };

  const deleteScenario = async (id) => {
    // Delete from Supabase first
    if (isSupabaseAvailable && user) {
      await deleteScenarioFromSupabase(id);
    }

    setScenarios(prev => {
      const filtered = prev.filter(s => s.id !== id);
      // If we deleted the current scenario, switch to the first remaining one
      if (currentScenario?.id === id) {
        const newCurrent = filtered.length > 0 ? filtered[0] : createDefaultScenario('Default Scenario');
        setCurrentScenario(newCurrent);
        if (filtered.length === 0) {
          return [newCurrent];
        }
      }
      
      // Update localStorage if Supabase not available
      if (!isSupabaseAvailable) {
        localStorage.setItem('retirement-scenarios', JSON.stringify(filtered));
      }
      
      return filtered;
    });
  };

  const renameScenario = async (id, newName) => {
    const updatedScenarios = scenarios.map(s => s.id === id ? { ...s, name: newName } : s);
    const targetScenario = updatedScenarios.find(s => s.id === id);
    
    // Update Supabase
    if (isSupabaseAvailable && user && targetScenario) {
      await updateScenarioInSupabase(targetScenario);
    }
    
    setScenarios(updatedScenarios);
    
    if (currentScenario?.id === id) {
      setCurrentScenario(prev => ({ ...prev, name: newName }));
    }
    
    // Update localStorage if Supabase not available
    if (!isSupabaseAvailable) {
      localStorage.setItem('retirement-scenarios', JSON.stringify(updatedScenarios));
    }
  };

  const loadScenario = (id) => {
    const scenario = scenarios.find(s => s.id === id);
    if (scenario) {
      setCurrentScenario(scenario);
    }
  };

  const duplicateScenario = async (id) => {
    setLastScenarioError(null);

    if (isScenarioLimitReached) {
      const error = { code: 'SCENARIO_LIMIT', scenarioLimit };
      setLastScenarioError(error);
      trackEvent('scenario_limit_hit', { limit: scenarioLimit });
      return { success: false, error };
    }

    const scenario = scenarios.find(s => s.id === id);
    if (scenario) {
      const duplicated = {
        ...scenario,
        id: Date.now().toString(),
        name: `${scenario.name} (Copy)`,
        createdAt: new Date().toISOString(),
        meta: { ...(scenario.meta ?? {}), duplicatedFromId: scenario.id, updatedAt: new Date().toISOString() },
      };
      
      // Save to Supabase
      if (isSupabaseAvailable && user) {
        const supabaseResult = await saveScenarioToSupabase(duplicated);
        if (supabaseResult) {
          duplicated.id = supabaseResult.id;
          duplicated.createdAt = supabaseResult.created_at;
        }
      }
      
      setScenarios(prev => [...prev, duplicated]);
      
      // Update localStorage if Supabase not available
      if (!isSupabaseAvailable) {
        localStorage.setItem('retirement-scenarios', JSON.stringify([...scenarios, duplicated]));
      }
      
      return duplicated;
    }
  };

  const exportScenariosBundle = () => {
    return {
      app: 'FireFed',
      type: 'scenarios_export',
      schemaVersion: SCENARIO_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      scenarios: scenarios.map(s => normalizeScenario(s)),
    };
  };

  const importScenariosFromJsonText = async (jsonText, { mode = 'merge' } = {}) => {
    setLastScenarioError(null);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const error = { code: 'IMPORT_PARSE_ERROR', message: 'Invalid JSON' };
      setLastScenarioError(error);
      return { success: false, error };
    }

    const incomingScenarios = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.scenarios)
        ? parsed.scenarios
        : null;

    if (!incomingScenarios) {
      const error = { code: 'IMPORT_FORMAT_ERROR', message: 'Expected an array of scenarios or { scenarios: [...] }' };
      setLastScenarioError(error);
      return { success: false, error };
    }

    const normalizedIncoming = incomingScenarios
      .filter(Boolean)
      .map((s) => normalizeScenario(s));

    // Enforce scenario limits on import as well.
    const existing = mode === 'replace' ? [] : scenarios.slice();
    const existingIds = new Set(existing.map(s => s.id));

    const canAdd = Number.isFinite(scenarioLimit) ? Math.max(0, scenarioLimit - existing.length) : normalizedIncoming.length;
    const toImport = normalizedIncoming.slice(0, canAdd);
    const skippedCount = Math.max(0, normalizedIncoming.length - toImport.length);

    const imported = toImport.map((s) => {
      let id = s.id;
      if (!id || existingIds.has(id)) {
        id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      existingIds.add(id);
      return {
        ...s,
        id,
        name: s.name || 'Imported Scenario',
        createdAt: s.createdAt || new Date().toISOString(),
        meta: { ...(s.meta ?? {}), importedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      };
    });

    const nextScenarios = [...existing, ...imported];
    setScenarios(nextScenarios);
    if (!currentScenario && nextScenarios.length > 0) {
      setCurrentScenario(nextScenarios[0]);
    }

    // Persist to localStorage fallback when Supabase isn't available
    if (!isSupabaseAvailable) {
      localStorage.setItem('retirement-scenarios', JSON.stringify(nextScenarios));
    }

    trackEvent('scenario_imported', { importedCount: imported.length, skippedCount, mode });

    if (skippedCount > 0) {
      const error = { code: 'SCENARIO_LIMIT', scenarioLimit };
      setLastScenarioError(error);
    }

    return { success: true, importedCount: imported.length, skippedCount };
  };

  const value = {
    scenarios,
    currentScenario,
    isLoadingScenarios,
    scenarioLimit,
    isScenarioLimitReached,
    lastScenarioError,
    saveScenario,
    updateCurrentScenario,
    deleteScenario,
    renameScenario,
    loadScenario,
    duplicateScenario,
    createDefaultScenario,
    getScenarioTemplates,
    buildScenarioFromTemplate,
    getScenarioDiff,
    exportScenariosBundle,
    importScenariosFromJsonText,
  };

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}; 