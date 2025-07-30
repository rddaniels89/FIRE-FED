import { useState } from 'react';
import { useScenario } from '../contexts/ScenarioContext';

function ScenarioManager() {
  const {
    scenarios,
    currentScenario,
    loadScenario,
    saveScenario,
    deleteScenario,
    renameScenario,
    duplicateScenario
  } = useScenario();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('save'); // 'save', 'rename'
  const [inputValue, setInputValue] = useState('');
  const [targetScenarioId, setTargetScenarioId] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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

  const handleSave = () => {
    if (!inputValue.trim()) return;
    
    if (modalType === 'save') {
      saveScenario(inputValue.trim(), currentScenario);
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

  const handleDuplicate = (scenarioId) => {
    duplicateScenario(scenarioId);
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
                        loadScenario(scenario.id);
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
        <button
          onClick={openSaveModal}
          className="btn-secondary"
          title="Save current inputs as a new scenario"
        >
          💾 Save New
        </button>
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
    </div>
  );
}

export default ScenarioManager; 