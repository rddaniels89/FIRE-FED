import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useScenario } from '../contexts/ScenarioContext';
import OnboardingCard from './OnboardingCard';

function HomePage() {
  const { scenarios, currentScenario, updateCurrentScenario } = useScenario();
  const [showFireInputs, setShowFireInputs] = useState(false);
  
  // FIRE form inputs state (using strings for controlled inputs)
  const [fireInputs, setFireInputs] = useState({
    desiredFireAge: '',
    monthlyFireIncomeGoal: '',
    sideHustleIncome: '',
    spouseIncome: ''
  });

  // Initialize FIRE inputs from current scenario
  useEffect(() => {
    if (currentScenario?.fire) {
      setFireInputs({
        desiredFireAge: currentScenario.fire.desiredFireAge?.toString() || '',
        monthlyFireIncomeGoal: currentScenario.fire.monthlyFireIncomeGoal?.toString() || '',
        sideHustleIncome: currentScenario.fire.sideHustleIncome?.toString() || '',
        spouseIncome: currentScenario.fire.spouseIncome?.toString() || ''
      });
    }
  }, [currentScenario]);

  // Handle FIRE input changes
  const handleFireInputChange = (field, value) => {
    setFireInputs(prev => ({ ...prev, [field]: value }));
    
    // Update scenario context with parsed numeric values
    const numericValue = parseFloat(value) || 0;
    updateCurrentScenario({
      fire: {
        ...currentScenario?.fire,
        [field]: numericValue
      }
    });
  };

  const features = [
    {
      icon: '📈',
      title: 'TSP Forecast',
      description: 'Calculate your Thrift Savings Plan growth with compound interest projections and compare Traditional vs Roth contribution strategies.',
      path: '/tsp-forecast',
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30'
    },
    {
      icon: '💰',
      title: 'FERS Pension',
      description: 'Calculate your Federal Employees Retirement System pension and compare staying federal vs leaving early.',
      path: '/fers-pension',
      color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/30'
    },
    {
      icon: '📊',
      title: 'Summary Dashboard',
      description: 'Combined analysis of your retirement projections with FIRE calculations and smart recommendations.',
      path: '/summary',
      color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/30'
    }
  ];

  const quickStats = [
    { label: 'TSP Funds', value: '5', description: 'G, F, C, S, I Funds' },
    { label: 'FERS Multiplier', value: '1.0-1.1%', description: 'Based on age & service' },
    { label: 'FIRE Rule', value: '25x', description: 'Annual expenses' },
    { label: 'MRA', value: '57', description: 'Minimum retirement age' }
  ];

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold navy-text mb-4">
          🔥 FireFed - Federal FIRE Planning
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
          The premier SaaS platform for federal employees pursuing Financial Independence Retire Early (FIRE). 
          Calculate TSP projections, FERS pension benefits, and analyze your FIRE gap with precision.
        </p>
      </div>

      <OnboardingCard />

      {/* Current Scenario Status */}
      {currentScenario && (
        <div className="mb-8 p-4 bg-navy-50 dark:bg-navy-900/20 border border-navy-200 dark:border-navy-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold navy-text">Current Scenario</h3>
              <p className="text-slate-600 dark:text-slate-400">
                <span className="font-medium">{currentScenario.name}</span> • 
                {scenarios.length} saved scenario{scenarios.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Created: {new Date(currentScenario.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 FIRE Planning Inputs - New FireFed Feature */}
      <div className="mb-8 card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold navy-text">🔥 FIRE Planning</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Configure your Financial Independence Retire Early goals
            </p>
          </div>
          <button
            onClick={() => setShowFireInputs(!showFireInputs)}
            className="btn-secondary text-sm"
          >
            {showFireInputs ? 'Hide' : 'Configure'} FIRE Settings
          </button>
        </div>

        {showFireInputs && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {/* FIRE Age Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Desired FIRE Age
              </label>
              <input
                type="number"
                min="40"
                max="67"
                value={fireInputs.desiredFireAge}
                onChange={(e) => handleFireInputChange('desiredFireAge', e.target.value)}
                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg 
                         bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 
                         focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all"
                placeholder="55"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Age when you want to achieve financial independence
              </p>
            </div>

            {/* Monthly FIRE Income Goal */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Monthly FIRE Income Goal
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-slate-500 dark:text-slate-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={fireInputs.monthlyFireIncomeGoal}
                  onChange={(e) => handleFireInputChange('monthlyFireIncomeGoal', e.target.value)}
                  className="w-full pl-8 p-3 border border-slate-300 dark:border-slate-600 rounded-lg 
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 
                           focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all"
                  placeholder="6000"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target monthly passive income in retirement
              </p>
            </div>

            {/* Side Hustle Income */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Side Hustle Income
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-slate-500 dark:text-slate-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={fireInputs.sideHustleIncome}
                  onChange={(e) => handleFireInputChange('sideHustleIncome', e.target.value)}
                  className="w-full pl-8 p-3 border border-slate-300 dark:border-slate-600 rounded-lg 
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 
                           focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all"
                  placeholder="500"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Monthly income from side businesses or freelancing
              </p>
            </div>

            {/* Spouse Income */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Spouse Income
              </label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-slate-500 dark:text-slate-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={fireInputs.spouseIncome}
                  onChange={(e) => handleFireInputChange('spouseIncome', e.target.value)}
                  className="w-full pl-8 p-3 border border-slate-300 dark:border-slate-600 rounded-lg 
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 
                           focus:ring-2 focus:ring-navy-500 focus:border-transparent transition-all"
                  placeholder="4000"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Monthly spouse/partner income or retirement benefits
              </p>
            </div>
          </div>
        )}

        {/* Quick FIRE Status Preview */}
        {currentScenario?.fire && (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium">FIRE Goal:</span> Age {currentScenario.fire.desiredFireAge} • 
              <span className="font-medium"> Target:</span> ${currentScenario.fire.monthlyFireIncomeGoal?.toLocaleString()}/month • 
              <span className="font-medium"> Additional Income:</span> ${(currentScenario.fire.sideHustleIncome + currentScenario.fire.spouseIncome)?.toLocaleString()}/month
            </div>
          </div>
        )}
      </div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        {features.map((feature, index) => (
          <Link 
            key={index} 
            to={feature.path}
            className={`block p-6 rounded-xl border-2 transition-all duration-200 hover:shadow-lg ${feature.color}`}
          >
            <div className="text-center">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold navy-text mb-3">{feature.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid md:grid-cols-4 gap-6 mb-12">
        {quickStats.map((stat, index) => (
          <div key={index} className="card p-6 text-center">
            <div className="text-2xl font-bold navy-text mb-2">{stat.value}</div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{stat.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{stat.description}</div>
          </div>
        ))}
      </div>

      {/* Key Features */}
      <div className="grid lg:grid-cols-2 gap-8 mb-12">
        <div className="card p-6">
          <h3 className="text-xl font-semibold navy-text mb-4">✨ Smart Features</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start space-x-3">
              <span className="text-green-500">✓</span>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">AI-Style Analysis</div>
                <div className="text-slate-500 dark:text-slate-400">Get personalized insights based on your savings rate and projections</div>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-green-500">✓</span>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Scenario Management</div>
                <div className="text-slate-500 dark:text-slate-400">Save and compare multiple retirement scenarios</div>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-green-500">✓</span>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Roth vs Traditional</div>
                <div className="text-slate-500 dark:text-slate-400">Compare TSP contribution strategies with tax implications</div>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <span className="text-green-500">✓</span>
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">PDF Export</div>
                <div className="text-slate-500 dark:text-slate-400">Download professional summary reports</div>
              </div>
            </li>
          </ul>
        </div>

        <div className="card p-6">
          <h3 className="text-xl font-semibold navy-text mb-4">📋 Important Disclaimers</h3>
          <div className="space-y-3 text-sm">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
              <div className="font-medium text-yellow-800 dark:text-yellow-300 mb-1">Educational Purpose</div>
              <div className="text-yellow-700 dark:text-yellow-400">
                All calculations are estimates for educational purposes only.
              </div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div className="font-medium text-blue-800 dark:text-blue-300 mb-1">Official Resources</div>
              <div className="text-blue-700 dark:text-blue-400">
                Consult TSP.gov and OPM.gov for authoritative information.
              </div>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <div className="font-medium text-red-800 dark:text-red-300 mb-1">Financial Advice</div>
              <div className="text-red-700 dark:text-red-400">
                This tool does not provide official financial advice.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="card p-8 text-center">
        <h3 className="text-2xl font-semibold navy-text mb-4">Ready to Plan Your Federal Retirement?</h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl mx-auto">
          Start by calculating your TSP projections, then explore your FERS pension options. 
          The summary dashboard will combine everything for a complete picture.
        </p>
        <div className="flex justify-center space-x-4">
          <Link 
            to="/tsp-forecast" 
            className="btn-primary"
          >
            📈 Start with TSP
          </Link>
          <Link 
            to="/fers-pension" 
            className="btn-secondary"
          >
            💰 Calculate Pension
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>
          Made with ❤️ for federal employees • 
          <a href="https://www.tsp.gov" target="_blank" rel="noopener noreferrer" className="text-navy-600 dark:text-navy-400 hover:text-gold-600 dark:hover:text-gold-400 mx-2">
            TSP.gov
          </a>
          •
          <a href="https://www.opm.gov" target="_blank" rel="noopener noreferrer" className="text-navy-600 dark:text-navy-400 hover:text-gold-600 dark:hover:text-gold-400 mx-2">
            OPM.gov
          </a>
        </p>
      </div>
    </div>
  );
}

export default HomePage; 