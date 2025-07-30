import { createContext, useContext, useState, useEffect } from 'react';

const ScenarioContext = createContext();

export const useScenario = () => {
  const context = useContext(ScenarioContext);
  if (!context) {
    throw new Error('useScenario must be used within a ScenarioProvider');
  }
  return context;
};

export const ScenarioProvider = ({ children }) => {
  const [scenarios, setScenarios] = useState([]);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(true);

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

  // Load scenarios from localStorage on initialization
  useEffect(() => {
    const savedScenarios = localStorage.getItem('retirement-scenarios');
    if (savedScenarios) {
      try {
        const parsed = JSON.parse(savedScenarios);
        if (parsed && parsed.length > 0) {
          // Ensure each scenario has all required fields with defaults
          const normalizedScenarios = parsed.map(scenario => ({
            ...createDefaultScenario(scenario.name || 'Scenario'),
            ...scenario
          }));
          setScenarios(normalizedScenarios);
          setCurrentScenario(normalizedScenarios[0]);
        } else {
          // Create default scenario if array is empty
          const defaultScenario = createDefaultScenario('Default Scenario');
          setScenarios([defaultScenario]);
          setCurrentScenario(defaultScenario);
        }
      } catch (error) {
        console.error('Error loading scenarios:', error);
        // Create default scenario if loading fails
        const defaultScenario = createDefaultScenario('Default Scenario');
        setScenarios([defaultScenario]);
        setCurrentScenario(defaultScenario);
      }
    } else {
      // Create default scenario if none exist
      const defaultScenario = createDefaultScenario('Default Scenario');
      setScenarios([defaultScenario]);
      setCurrentScenario(defaultScenario);
    }
    setIsLoadingScenarios(false);
  }, []);

  // Save scenarios to localStorage whenever they change
  useEffect(() => {
    if (!isLoadingScenarios && scenarios.length > 0) {
      localStorage.setItem('retirement-scenarios', JSON.stringify(scenarios));
    }
  }, [scenarios, isLoadingScenarios]);

  const saveScenario = (name, data) => {
    const scenario = {
      ...createDefaultScenario(name),
      ...data,
      id: Date.now().toString(),
      name,
      createdAt: new Date().toISOString()
    };
    
    setScenarios(prev => [...prev, scenario]);
    setCurrentScenario(scenario);
    return scenario;
  };

  const updateCurrentScenario = (updates) => {
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
  };

  const deleteScenario = (id) => {
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
      return filtered;
    });
  };

  const renameScenario = (id, newName) => {
    setScenarios(prev => 
      prev.map(s => s.id === id ? { ...s, name: newName } : s)
    );
    
    if (currentScenario?.id === id) {
      setCurrentScenario(prev => ({ ...prev, name: newName }));
    }
  };

  const loadScenario = (id) => {
    const scenario = scenarios.find(s => s.id === id);
    if (scenario) {
      setCurrentScenario(scenario);
    }
  };

  const duplicateScenario = (id) => {
    const scenario = scenarios.find(s => s.id === id);
    if (scenario) {
      const duplicated = {
        ...scenario,
        id: Date.now().toString(),
        name: `${scenario.name} (Copy)`,
        createdAt: new Date().toISOString()
      };
      setScenarios(prev => [...prev, duplicated]);
      return duplicated;
    }
  };

  const value = {
    scenarios,
    currentScenario,
    isLoadingScenarios,
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