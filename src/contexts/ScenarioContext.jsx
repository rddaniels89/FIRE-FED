import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseAvailable } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { DEFAULT_FREE_SCENARIO_LIMIT } from '../lib/entitlements';
import { trackEvent } from '../lib/telemetry';

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

  const scenarioLimit = entitlements?.scenarioLimit ?? DEFAULT_FREE_SCENARIO_LIMIT;
  const isScenarioLimitReached = Number.isFinite(scenarioLimit) ? scenarios.length >= scenarioLimit : false;

  // Default scenario structure
  const createDefaultScenario = (name = 'New Scenario') => ({
    id: Date.now().toString(),
    name,
    createdAt: new Date().toISOString(),
    tsp: {
      currentBalance: 50000,
      currentAge: 35,
      retirementAge: 62,
      monthlyContributionPercent: 10,
      annualSalary: 80000,
      allocation: {
        G: 10,
        F: 20,
        C: 40,
        S: 20,
        I: 10
      },
      contributionType: 'traditional' // 'traditional' or 'roth'
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
      monthlyExpenses: 4000
    }
  });

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
              const normalizedScenarios = data.map(scenario => ({
                id: scenario.id,
                name: scenario.scenario_name,
                createdAt: scenario.created_at,
                tsp: scenario.tsp_data || createDefaultScenario().tsp,
                fers: scenario.fers_data || createDefaultScenario().fers,
                fire: scenario.fire_goal || createDefaultScenario().fire,
                summary: { monthlyExpenses: 4000 } // Default value
              }));
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
            const normalizedScenarios = parsed.map(scenario => ({
              ...createDefaultScenario(scenario.name || 'Scenario'),
              ...scenario
            }));
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
            fire_goal: scenario.fire
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
          fire_goal: scenario.fire
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

    const scenario = {
      ...createDefaultScenario(name),
      ...data,
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString()
    };
    
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
    const updatedScenario = {
      ...currentScenario,
      ...updates,
      // Ensure nested objects are properly merged
      tsp: updates.tsp ? { ...currentScenario.tsp, ...updates.tsp } : currentScenario.tsp,
      fers: updates.fers ? { ...currentScenario.fers, ...updates.fers } : currentScenario.fers,
      fire: updates.fire ? { ...currentScenario.fire, ...updates.fire } : currentScenario.fire,
      summary: updates.summary ? { ...currentScenario.summary, ...updates.summary } : currentScenario.summary
    };
    
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
        createdAt: new Date().toISOString()
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
    createDefaultScenario
  };

  return (
    <ScenarioContext.Provider value={value}>
      {children}
    </ScenarioContext.Provider>
  );
}; 