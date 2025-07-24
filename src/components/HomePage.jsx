import { Link } from 'react-router-dom';
import { useScenario } from '../contexts/ScenarioContext';

function HomePage() {
  const { scenarios, currentScenario } = useScenario();

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
          🏛️ Federal Retirement Advisor
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
          Plan your federal retirement with confidence. Calculate TSP projections, FERS pension benefits, 
          and discover your path to Financial Independence.
        </p>
      </div>

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