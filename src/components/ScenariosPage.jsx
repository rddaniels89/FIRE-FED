import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, hasEntitlement } from '../lib/entitlements';

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
    saveScenario,
    deleteScenario, 
    duplicateScenario, 
    renameScenario,
    getScenarioTemplates,
    buildScenarioFromTemplate,
    getScenarioDiff,
    exportScenariosBundle,
    importScenariosFromJsonText,
  } = useScenario();
  
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [isRenaming, setIsRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [isLoadPreviewOpen, setIsLoadPreviewOpen] = useState(false);
  const [pendingLoadScenarioId, setPendingLoadScenarioId] = useState(null);
  
  // Pro feature gating using AuthContext
  const { entitlements } = useAuth();
  const canCompare = hasEntitlement(entitlements, FEATURES.SCENARIO_COMPARE);
  const canExportImport = hasEntitlement(entitlements, FEATURES.SCENARIO_EXPORT_IMPORT);
  const navigate = useNavigate();
  const importFileRef = useRef(null);

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

  const openLoadPreview = (scenarioId) => {
    setPendingLoadScenarioId(scenarioId);
    setIsLoadPreviewOpen(true);
  };

  const closeLoadPreview = () => {
    setIsLoadPreviewOpen(false);
    setPendingLoadScenarioId(null);
  };

  const formatDiffValue = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  const downloadTextFile = ({ filename, text, mimeType }) => {
    const blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
          {entitlements?.isPro && (
            <span className="px-3 py-1 bg-gold-100 dark:bg-gold-900 text-gold-800 dark:text-gold-200 
                           text-xs font-semibold rounded-full border border-gold-200 dark:border-gold-700">
              ✨ PRO FEATURES
            </span>
          )}

          {/* Export / Import (Pro) */}
          <div className="flex items-center space-x-2">
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const result = await importScenariosFromJsonText(text, { mode: 'merge' });
                  if (result?.success) {
                    alert(`Imported ${result.importedCount} scenario(s)${result.skippedCount ? ` (skipped ${result.skippedCount} due to your scenario limit)` : ''}.`);
                  } else {
                    alert(result?.error?.message || 'Import failed.');
                  }
                } catch {
                  alert('Import failed.');
                } finally {
                  // allow re-importing the same file
                  e.target.value = '';
                }
              }}
            />

            <button
              className="btn-secondary"
              title={!canExportImport ? 'Pro feature - export/import scenarios' : 'Export scenarios as JSON'}
              onClick={() => {
                if (!canExportImport) {
                  navigate('/pro-features', { state: { reason: 'export_import_pro' } });
                  return;
                }
                const bundle = exportScenariosBundle();
                downloadTextFile({
                  filename: `firefed-scenarios-${new Date().toISOString().slice(0, 10)}.json`,
                  text: JSON.stringify(bundle, null, 2),
                  mimeType: 'application/json',
                });
              }}
            >
              {canExportImport ? '⬇️ Export' : '🔒 Export'}
            </button>

            <button
              className="btn-secondary"
              title={!canExportImport ? 'Pro feature - export/import scenarios' : 'Import scenarios from JSON'}
              onClick={() => {
                if (!canExportImport) {
                  navigate('/pro-features', { state: { reason: 'export_import_pro' } });
                  return;
                }
                importFileRef.current?.click();
              }}
            >
              {canExportImport ? '⬆️ Import' : '🔒 Import'}
            </button>
          </div>

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
              disabled={!canCompare}
              title={!canCompare ? "Pro feature - join the waitlist to compare scenarios" : "Compare selected scenarios"}
              onClick={() => {
                if (!canCompare) {
                  navigate('/pro-features', { state: { reason: 'compare_pro' } });
                  return;
                }
                navigate('/scenarios/compare', { state: { scenarioIds: selectedScenarios } });
              }}
            >
              {canCompare ? '📊 Compare Scenarios' : '🔒 Pro Feature'}
            </button>
          </div>
        </div>
      )}

      {/* Templates */}
      <div className="card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold navy-text">⚡ Quick-start templates</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Start faster with a baseline scenario for your age band. You can tweak everything after creating it.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {getScenarioTemplates().map((t) => (
            <div key={t.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="font-semibold navy-text">{t.name}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t.description}</div>
              <button
                className="btn-primary w-full mt-4"
                onClick={async () => {
                  const scenarioData = buildScenarioFromTemplate(t.id);
                  const result = await saveScenario(t.name, scenarioData);
                  if (result?.success === false && result?.error?.code === 'SCENARIO_LIMIT') {
                    navigate('/pro-features', { state: { reason: 'scenario_limit', limit: result.error.scenarioLimit } });
                    return;
                  }
                }}
              >
                Create from template
              </button>
            </div>
          ))}
        </div>
      </div>

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
                        onClick={() => openLoadPreview(scenario.id)}
                        className="btn-secondary text-sm"
                      >
                        Load
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        const result = await duplicateScenario(scenario.id);
                        if (result?.success === false && result?.error?.code === 'SCENARIO_LIMIT') {
                          navigate('/pro-features', { state: { reason: 'scenario_limit', limit: result.error.scenarioLimit } });
                        }
                      }}
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
      {!entitlements?.isPro && (
        <div className="mt-8 card p-6 text-center bg-gradient-to-r from-gold-50 to-navy-50 dark:from-gold-900/20 dark:to-navy-900/20 
                        border border-gold-200 dark:border-gold-700">
          <h3 className="text-xl font-semibold navy-text mb-2">🔥 Unlock FireFed Pro</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Get advanced scenario comparison, Supabase sync, and premium retirement planning tools
          </p>
          <Link
            to="/pro-features"
            className="btn-primary bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 inline-flex items-center justify-center"
          >
            ⭐ Join Pro Waitlist
          </Link>
        </div>
      )}

      {/* Load Preview Modal */}
      {isLoadPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg w-[560px] max-w-[95vw]">
            {(() => {
              const target = scenarios.find(s => s.id === pendingLoadScenarioId);
              const diffs = getScenarioDiff(currentScenario, target);

              return (
                <>
                  <h3 className="text-lg font-semibold navy-text mb-2">
                    Load scenario: {target?.name || 'Selected scenario'}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Here’s what will change if you switch scenarios.
                  </p>

                  <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    {diffs.length === 0 ? (
                      <div className="p-4 text-sm text-slate-600 dark:text-slate-400">
                        No key differences detected.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {diffs.map((d) => (
                          <div key={d.path} className="p-3 text-sm">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{d.label}</div>
                            <div className="grid grid-cols-2 gap-3 mt-1">
                              <div className="text-slate-600 dark:text-slate-400">
                                <div className="text-xs uppercase tracking-wide">Current</div>
                                <div className="font-mono text-xs">{formatDiffValue(d.from)}</div>
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                <div className="text-xs uppercase tracking-wide">Selected</div>
                                <div className="font-mono text-xs">{formatDiffValue(d.to)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 justify-end mt-5">
                    <button
                      onClick={closeLoadPreview}
                      className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (pendingLoadScenarioId) loadScenario(pendingLoadScenarioId);
                        closeLoadPreview();
                      }}
                      className="btn-primary"
                    >
                      Load Scenario
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default ScenariosPage; 