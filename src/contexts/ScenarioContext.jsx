import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { DEFAULT_FREE_SCENARIO_LIMIT } from '../lib/entitlements';
import { trackEvent } from '../lib/telemetry';
import { isLocalOnlyUser } from '../lib/auth/session';
import { SNAPSHOT_CONFLICT_TARGET, buildScenarioSnapshot } from '../lib/scenarios/snapshots';
import {
  SCENARIO_SCHEMA_VERSION,
  SCENARIO_TEMPLATES,
  applyScenarioUpdates,
  buildScenarioFromTemplate as buildFromTemplate,
  createDefaultScenario as createDefault,
  getScenarioDiff as diffScenarios,
  normalizeScenario as normalize,
} from '../lib/scenarios/schema';
import { fromScenarioRow, toScenarioRow } from '../lib/scenarios/storage';

const ScenarioContext = createContext();

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
  // A rejected cloud write still leaves the scenario in local state, so without
  // this the user sees a normal, working UI while nothing persists.
  const [cloudSyncError, setCloudSyncError] = useState(null);

  const scenarioLimit = entitlements?.scenarioLimit ?? DEFAULT_FREE_SCENARIO_LIMIT;
  const isScenarioLimitReached = Number.isFinite(scenarioLimit) ? scenarios.length >= scenarioLimit : false;
  const canUseCloudScenarios = isSupabaseAvailable && user && !isLocalOnlyUser(user);

  // The schema lives in lib/scenarios/schema.js so it can be tested without React.
  const createDefaultScenario = (name = 'New Scenario') => normalize(createDefault(name));
  const normalizeScenario = (scenario) => normalize(scenario);
  const getScenarioTemplates = () => SCENARIO_TEMPLATES.slice();
  const buildScenarioFromTemplate = (templateId, nameOverride) => buildFromTemplate(templateId, nameOverride);
  const getScenarioDiff = (fromScenario, toScenario) => diffScenarios(fromScenario, toScenario);

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
        if (canUseCloudScenarios) {
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
              const normalizedScenarios = data.map((row) => normalizeScenario(fromScenarioRow(row)));
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
    const persistLocally =
      !isLoadingScenarios &&
      scenarios.length > 0 &&
      (!isSupabaseAvailable || isLocalOnlyUser(user));
    if (persistLocally) {
      localStorage.setItem('retirement-scenarios', JSON.stringify(scenarios));
    }
  }, [scenarios, isLoadingScenarios, user]);

  // Records the scenario's state for today so a later plan-over-time view has
  // history to read. Best-effort by design: a failed snapshot must never fail
  // the save the user actually asked for.
  const recordScenarioSnapshot = async (scenario) => {
    if (!isSupabaseAvailable || !user || isLocalOnlyUser(user)) return null;

    const snapshot = buildScenarioSnapshot({ scenario, userId: user.id });
    if (!snapshot) return null;

    try {
      const { error } = await supabase
        .from('scenario_snapshots')
        .upsert(snapshot, { onConflict: SNAPSHOT_CONFLICT_TARGET });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error recording scenario snapshot:', error);
      return null;
    }
  };

  // Helper function to save scenario to Supabase
  const saveScenarioToSupabase = async (scenario) => {
    if (!isSupabaseAvailable || !user || isLocalOnlyUser(user)) return null;

    try {
      const { data, error } = await supabase
        .from('scenarios')
        .insert([{ user_id: user.id, ...toScenarioRow(scenario) }])
        .select()
        .single();

      if (error) throw error;
      // Snapshot from the returned row: it carries the database-generated id
      // the snapshot's foreign key needs, and confirms the write landed.
      await recordScenarioSnapshot({ ...scenario, id: data.id });
      setCloudSyncError(null);
      return data;
    } catch (error) {
      console.error('Error saving scenario to Supabase:', error);
      setCloudSyncError({ operation: 'save', error });
      trackEvent('scenario_cloud_sync_failed', { operation: 'save', code: error?.code ?? null });
      return null;
    }
  };

  // Helper function to update scenario in Supabase
  const updateScenarioInSupabase = async (scenario) => {
    if (!isSupabaseAvailable || !user || isLocalOnlyUser(user)) return null;

    try {
      const { data, error } = await supabase
        .from('scenarios')
        .update(toScenarioRow(scenario))
        .eq('id', scenario.id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      await recordScenarioSnapshot({ ...scenario, id: data.id });
      setCloudSyncError(null);
      return data;
    } catch (error) {
      console.error('Error updating scenario in Supabase:', error);
      setCloudSyncError({ operation: 'update', error });
      trackEvent('scenario_cloud_sync_failed', { operation: 'update', code: error?.code ?? null });
      return null;
    }
  };

  // Helper function to delete scenario from Supabase
  const deleteScenarioFromSupabase = async (scenarioId) => {
    if (!isSupabaseAvailable || !user || isLocalOnlyUser(user)) return null;

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
    if (canUseCloudScenarios) {
      const supabaseResult = await saveScenarioToSupabase(scenario);
      if (supabaseResult) {
        scenario.id = supabaseResult.id; // Use Supabase-generated ID
        scenario.createdAt = supabaseResult.created_at;
      }
    }
    
    setScenarios(prev => [...prev, scenario]);
    setCurrentScenario(scenario);
    trackEvent('scenario_created', { count: scenarios.length + 1 });
    
    if (!canUseCloudScenarios) {
      localStorage.setItem('retirement-scenarios', JSON.stringify([...scenarios, scenario]));
    }

    return scenario;
  };

  const updateCurrentScenario = async (updates) => {
    if (!currentScenario) return;
    
    // Legacy field writes are translated onto the profile and every block is
    // deep-merged, so a partial `summary.assumptions` patch cannot wipe the rest.
    const updatedScenario = applyScenarioUpdates(currentScenario, updates);
    
    setCurrentScenario(updatedScenario);
    
    setScenarios(prev => 
      prev.map(s => s.id === currentScenario.id ? updatedScenario : s)
    );

    // Sync with Supabase if available
    if (canUseCloudScenarios) {
      clearTimeout(updateCurrentScenario.timeoutId);
      updateCurrentScenario.timeoutId = setTimeout(async () => {
        await updateScenarioInSupabase(updatedScenario);
      }, 1000);
    } else {
      const updatedScenarios = scenarios.map(s => s.id === currentScenario.id ? updatedScenario : s);
      localStorage.setItem('retirement-scenarios', JSON.stringify(updatedScenarios));
    }
  };

  const deleteScenario = async (id) => {
    // Delete from Supabase first
    if (canUseCloudScenarios) {
      await deleteScenarioFromSupabase(id);
    }

    setScenarios(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (currentScenario?.id === id) {
        const newCurrent = filtered.length > 0 ? filtered[0] : createDefaultScenario('Default Scenario');
        setCurrentScenario(newCurrent);
        if (filtered.length === 0) {
          return [newCurrent];
        }
      }

      if (!canUseCloudScenarios) {
        localStorage.setItem('retirement-scenarios', JSON.stringify(filtered));
      }

      return filtered;
    });
  };

  const renameScenario = async (id, newName) => {
    const updatedScenarios = scenarios.map(s => s.id === id ? { ...s, name: newName } : s);
    const targetScenario = updatedScenarios.find(s => s.id === id);
    
    // Update Supabase
    if (canUseCloudScenarios && targetScenario) {
      await updateScenarioInSupabase(targetScenario);
    }

    setScenarios(updatedScenarios);

    if (currentScenario?.id === id) {
      setCurrentScenario(prev => ({ ...prev, name: newName }));
    }

    if (!canUseCloudScenarios) {
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
      if (canUseCloudScenarios) {
        const supabaseResult = await saveScenarioToSupabase(duplicated);
        if (supabaseResult) {
          duplicated.id = supabaseResult.id;
          duplicated.createdAt = supabaseResult.created_at;
        }
      }

      setScenarios(prev => [...prev, duplicated]);

      if (!canUseCloudScenarios) {
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
    cloudSyncError,
    dismissCloudSyncError: () => setCloudSyncError(null),
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