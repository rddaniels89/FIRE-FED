import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';

/**
 * ScenariosPage Component - Core MVP feature for FireFed SaaS
 * 
 * Shows saved retirement scenarios with comparison capabilities
 * Will be a gated Pro feature with Supabase integration later
 */
function ScenariosPage() {
  const { 
    scenarios, 
    currentScenario, 
    loadScenario, 
    deleteScenario, 
    duplicateScenario, 
    renameScenario 
  } = useScenario();
  
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [isRenaming, setIsRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  
  // Pro feature gating using AuthContext
  const { isProUser, hasFeature, upgradeToPro } = useAuth();

  const handleScenarioSelect = (scenarioId) => {
    setSelectedScenarios(prev => {
      if (prev.includes(scenarioId)) {
        return prev.filter(id => id !== scenarioId);
      } else if (prev.length < 3) { // Limit to 3 scenarios for comparison
        return [...prev, scenarioId];
      }
      return prev;
    });
  };

  const handleRename = (scenario) => {
    setIsRenaming(scenario.id);
    setRenameValue(scenario.name);
  };

  const saveRename = (scenarioId) => {
    if (renameValue.trim()) {
      renameScenario(scenarioId, renameValue.trim());
    }
    setIsRenaming(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setIsRenaming(null);
    setRenameValue('');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getScenarioSummary = (scenario) => {
    // Calculate key metrics for preview
    const tspBalance = scenario.tsp?.currentBalance || 0;
    const fireAge = scenario.fire?.desiredFireAge || 0;
    const fireGoal = scenario.fire?.monthlyFireIncomeGoal || 0;
    
    return {
      tspBalance,
      fireAge,
      fireGoal,
      yearsOfService: scenario.fers?.yearsOfService || 0
    };
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold navy-text mb-2">💼 Retirement Scenarios</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Manage and compare your retirement planning scenarios
          </p>
        </div>
        
        {/* Pro Feature Badge */}
        <div className="flex items-center space-x-4 mt-4 md:mt-0">
          {isProUser && (
            <span className="px-3 py-1 bg-gold-100 dark:bg-gold-900 text-gold-800 dark:text-gold-200 
                           text-xs font-semibold rounded-full border border-gold-200 dark:border-gold-700">
              ✨ PRO FEATURES
            </span>
          )}
          <Link to="/" className="btn-secondary">
            ← Back to Home
          </Link>
        </div>
      </div>

      {/* Scenarios Overview */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold navy-text">{scenarios.length}</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Total Scenarios</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold navy-text">{selectedScenarios.length}</div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Selected for Comparison</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-gold-600">
            {currentScenario?.name?.slice(0, 10) || 'None'}...
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Active Scenario</div>
        </div>
      </div>

      {/* Compare Scenarios Button - Pro Feature */}
      {selectedScenarios.length >= 2 && (
        <div className="mb-6 p-4 bg-gradient-to-r from-gold-50 to-navy-50 dark:from-gold-900/20 dark:to-navy-900/20 
                        border border-gold-200 dark:border-gold-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gold-800 dark:text-gold-300">
                🔥 Scenario Comparison Ready
              </h3>
              <p className="text-sm text-gold-700 dark:text-gold-400">
                Compare {selectedScenarios.length} scenarios side-by-side
              </p>
            </div>
            <button 
              className="btn-primary bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700"
              disabled={!isProUser}
              title={!isProUser ? "Pro feature - upgrade to compare scenarios" : "Compare selected scenarios"}
            >
              {isProUser ? '📊 Compare Scenarios' : '🔒 Pro Feature'}
            </button>
          </div>
        </div>
      )}

      {/* Scenarios List */}
      <div className="space-y-4">
        {scenarios.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-xl font-semibold navy-text mb-2">No scenarios yet</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Create your first retirement scenario to get started
            </p>
            <Link to="/" className="btn-primary">
              📈 Create Scenario
            </Link>
          </div>
        ) : (
          scenarios.map((scenario) => {
            const summary = getScenarioSummary(scenario);
            const isActive = currentScenario?.id === scenario.id;
            const isSelected = selectedScenarios.includes(scenario.id);
            
            return (
              <div 
                key={scenario.id} 
                className={`card p-6 transition-all duration-200 ${
                  isActive 
                    ? 'ring-2 ring-navy-500 bg-navy-50 dark:bg-navy-900/20' 
                    : 'hover:shadow-lg'
                } ${
                  isSelected 
                    ? 'ring-2 ring-gold-500 bg-gold-50 dark:bg-gold-900/20' 
                    : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  {/* Scenario Info */}
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {/* Selection Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleScenarioSelect(scenario.id)}
                        className="w-4 h-4 text-gold-600 bg-gray-100 border-gray-300 rounded 
                                 focus:ring-gold-500 dark:focus:ring-gold-600 dark:ring-offset-gray-800 
                                 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      
                      {/* Scenario Name */}
                      {isRenaming === scenario.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 
                                     rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(scenario.id);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            autoFocus
                          />
                          <button 
                            onClick={() => saveRename(scenario.id)}
                            className="text-green-600 hover:text-green-700 text-sm"
                          >
                            ✓
                          </button>
                          <button 
                            onClick={cancelRename}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold navy-text">
                            {scenario.name}
                          </h3>
                          {isActive && (
                            <span className="px-2 py-1 bg-navy-100 dark:bg-navy-800 text-navy-800 dark:text-navy-200 
                                           text-xs font-medium rounded">
                              Active
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Scenario Summary */}
                    <div className="grid md:grid-cols-4 gap-4 mt-4">
                      <div className="text-sm">
                        <div className="text-slate-500 dark:text-slate-400">TSP Balance</div>
                        <div className="font-medium">{formatCurrency(summary.tspBalance)}</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-slate-500 dark:text-slate-400">FIRE Age</div>
                        <div className="font-medium">{summary.fireAge || 'Not set'}</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-slate-500 dark:text-slate-400">Monthly Goal</div>
                        <div className="font-medium">{formatCurrency(summary.fireGoal)}</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-slate-500 dark:text-slate-400">Years of Service</div>
                        <div className="font-medium">{summary.yearsOfService} years</div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Created: {new Date(scenario.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 ml-4">
                    {!isActive && (
                      <button
                        onClick={() => loadScenario(scenario.id)}
                        className="btn-secondary text-sm"
                      >
                        Load
                      </button>
                    )}
                    <button
                      onClick={() => duplicateScenario(scenario.id)}
                      className="btn-secondary text-sm"
                      title="Duplicate scenario"
                    >
                      📋
                    </button>
                    <button
                      onClick={() => handleRename(scenario)}
                      className="btn-secondary text-sm"
                      title="Rename scenario"
                    >
                      ✏️
                    </button>
                    {scenarios.length > 1 && (
                      <button
                        onClick={() => deleteScenario(scenario.id)}
                        className="btn-secondary text-sm text-red-600 hover:text-red-700"
                        title="Delete scenario"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pro Feature Callout */}
      {!isProUser && (
        <div className="mt-8 card p-6 text-center bg-gradient-to-r from-gold-50 to-navy-50 dark:from-gold-900/20 dark:to-navy-900/20 
                        border border-gold-200 dark:border-gold-700">
          <h3 className="text-xl font-semibold navy-text mb-2">🔥 Unlock FireFed Pro</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Get advanced scenario comparison, Supabase sync, and premium retirement planning tools
          </p>
          <button className="btn-primary bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700">
            ⚡ Upgrade to Pro
          </button>
        </div>
      )}
    </div>
  );
}

export default ScenariosPage; 