import { useState } from 'react';
import { useScenario } from '../contexts/ScenarioContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

function ScenarioManager() {
  const { isAuthenticated } = useAuth();
  const {
    scenarios,
    currentScenario,
    loadScenario,
    saveScenario,
    deleteScenario,
    renameScenario,
    duplicateScenario,
    getScenarioDiff,
    isScenarioLimitReached,
    scenarioLimit
  } = useScenario();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('save'); // 'save', 'rename'
  const [inputValue, setInputValue] = useState('');
  const [targetScenarioId, setTargetScenarioId] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isLoadPreviewOpen, setIsLoadPreviewOpen] = useState(false);
  const [pendingLoadScenarioId, setPendingLoadScenarioId] = useState(null);

  const openSaveModal = () => {
    setModalType('save');
    setInputValue('');
    setIsModalOpen(true);
  };

  const openRenameModal = (scenarioId, currentName) => {
    setModalType('rename');
    setInputValue(currentName);
    setTargetScenarioId(scenarioId);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setInputValue('');
    setTargetScenarioId(null);
  };

  const closeLoadPreview = () => {
    setIsLoadPreviewOpen(false);
    setPendingLoadScenarioId(null);
  };

  const openLoadPreview = (scenarioId) => {
    setPendingLoadScenarioId(scenarioId);
    setIsLoadPreviewOpen(true);
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

  const handleSave = async () => {
    if (!inputValue.trim()) return;
    
    if (modalType === 'save') {
      const result = await saveScenario(inputValue.trim(), currentScenario);
      if (result?.success === false && result?.error?.code === 'SCENARIO_LIMIT') {
        closeModal();
        navigate('/pro-features', { state: { reason: 'scenario_limit', limit: result.error.scenarioLimit } });
        return;
      }
    } else if (modalType === 'rename') {
      renameScenario(targetScenarioId, inputValue.trim());
    }
    
    closeModal();
  };

  const handleDelete = (scenarioId) => {
    if (scenarios.length <= 1) {
      alert('Cannot delete the last scenario.');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this scenario?')) {
      deleteScenario(scenarioId);
    }
  };

  const handleDuplicate = async (scenarioId) => {
    const result = await duplicateScenario(scenarioId);
    if (result?.success === false && result?.error?.code === 'SCENARIO_LIMIT') {
      navigate('/pro-features', { state: { reason: 'scenario_limit', limit: result.error.scenarioLimit } });
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3 mb-6">
        {/* Scenario Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="btn-primary flex items-center gap-2 min-w-[200px] justify-between"
          >
            <span className="truncate">{currentScenario?.name || 'Select Scenario'}</span>
            <span className="text-sm">▼</span>
          </button>
          
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
              <div className="p-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 px-2">
                  Saved Scenarios ({scenarios.length})
                </div>
                
                {scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className={`group flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                      currentScenario?.id === scenario.id 
                        ? 'bg-navy-50 dark:bg-navy-900/20 border border-navy-200 dark:border-navy-700' 
                        : ''
                    }`}
                  >
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        if (scenario.id !== currentScenario?.id) {
                          openLoadPreview(scenario.id);
                        }
                        setIsDropdownOpen(false);
                      }}
                    >
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {scenario.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(scenario.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameModal(scenario.id, scenario.name);
                          setIsDropdownOpen(false);
                        }}
                        className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(scenario.id);
                        }}
                        className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                        title="Duplicate"
                      >
                        📋
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(scenario.id);
                        }}
                        className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        title="Delete"
                        disabled={scenarios.length <= 1}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Save New Scenario Button */}
        {isAuthenticated ? (
          <button
            onClick={openSaveModal}
            className="btn-secondary"
            title="Save current inputs as a new scenario"
            disabled={isScenarioLimitReached}
          >
            {isScenarioLimitReached ? `🔒 Save Limit (${scenarioLimit})` : '💾 Save New'}
          </button>
        ) : (
          <div className="relative group">
            <button
              disabled
              className="btn-secondary opacity-50 cursor-not-allowed"
              title="Please log in to save scenarios"
            >
              🔒 Save New
            </button>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap z-50">
              🔒 Please log in to save or export your FIRE scenario.
            </div>
          </div>
        )}
      </div>

      {/* Click outside to close dropdown */}
      {isDropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsDropdownOpen(false)}
        />
      )}

      {/* Modal for Save/Rename */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg w-96">
            <h3 className="text-lg font-semibold navy-text mb-4">
              {modalType === 'save' ? 'Save New Scenario' : 'Rename Scenario'}
            </h3>
            
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter scenario name..."
              className="input-field w-full mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') closeModal();
              }}
            />
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="btn-primary"
                disabled={!inputValue.trim()}
              >
                {modalType === 'save' ? 'Save' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Preview Modal */}
      {isLoadPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg w-[520px] max-w-[95vw]">
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

                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
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

export default ScenarioManager; 