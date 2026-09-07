import { Link } from 'react-router-dom';
import { Check, LayoutDashboard, Landmark, Map, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { useScenario } from '../contexts/ScenarioContext';
import OnboardingCard from './OnboardingCard';
import AnimatedFlame from './AnimatedFlame';

const money = (n) => (Number.isFinite(Number(n)) ? `$${Math.round(Number(n)).toLocaleString()}` : '—');

function HomePage() {
  const { scenarios, currentScenario } = useScenario();

  const features = [
    {
      Icon: TrendingUp,
      title: 'TSP Forecast',
      description: 'Calculate your Thrift Savings Plan growth with compound interest projections and compare Traditional vs Roth contribution strategies.',
      path: '/tsp-forecast',
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30'
    },
    {
      Icon: Landmark,
      title: 'FERS Pension',
      description: 'Calculate your Federal Employees Retirement System pension and compare staying federal vs leaving early.',
      path: '/fers-pension',
      color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/30'
    },
    {
      Icon: LayoutDashboard,
      title: 'Summary',
      description: 'A cross-check of the TSP and pension calculators against your income goal, with the FIRE gap at your separation age.',
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

  const profile = currentScenario?.profile;
  const fire = currentScenario?.fire;

  return (
    <div className="animate-fade-in">
      <OnboardingCard />

      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold navy-text mb-4">
          <span className="inline-flex items-center justify-center gap-3">
            {/* aria-hidden on the wrapper: the mark carries its own label, and
                the heading text already names the product. */}
            <span aria-hidden="true" className="inline-flex">
              <AnimatedFlame className="h-11 w-11" />
            </span>
            <span>FireFed - Federal FIRE Planning</span>
          </span>
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
          One profile, one model. Enter your numbers once and every page — pension, TSP, timeline,
          scenarios — reads from the same plan.
        </p>
      </div>

      {/* My Plan */}
      {currentScenario && (
        <div className="mb-8 card p-6" data-testid="my-plan-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold navy-text flex items-center gap-2">
                <Map className="h-5 w-5" aria-hidden="true" />
                My Plan
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                <span className="font-medium">{currentScenario.name}</span> · {scenarios.length} saved scenario{scenarios.length !== 1 ? 's' : ''}
              </p>
              {profile && fire ? (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                  Age {profile.currentAge} · leaving at {profile.separationAge} · goal {money(fire.monthlyFireIncomeGoal)}/month
                  {Number(fire.sideHustleIncome) > 0 ? ` · side income ${money(fire.sideHustleIncome)}/month` : ''}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/plan" className="btn-primary inline-flex items-center gap-2">
                <Map className="h-4 w-4" aria-hidden="true" />
                View my plan
              </Link>
              <Link to="/plan/inputs" className="btn-secondary inline-flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Edit inputs
              </Link>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
            Separation age, income goal, side income, and household all live on the inputs page. You never enter the same number twice.
          </p>
        </div>
      )}

      {/* Feature Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        {features.map((feature, index) => (
          <Link
            key={index}
            to={feature.path}
            className={`block p-6 rounded-xl border-2 transition-all duration-200 hover:shadow-card ${feature.color}`}
          >
            <div className="text-center">
              <feature.Icon className="h-9 w-9 mx-auto mb-4 text-navy-600 dark:text-navy-300" aria-hidden="true" />
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
          <h3 className="text-xl font-semibold navy-text mb-4">How it fits together</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start space-x-3">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">One profile</div>
                <div className="text-slate-500 dark:text-slate-400">Every calculator and the plan timeline read the same inputs</div>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Scenario comparison (Pro)</div>
                <div className="text-slate-500 dark:text-slate-400">Compare saved scenarios side by side with a delta view</div>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">Roth vs Traditional</div>
                <div className="text-slate-500 dark:text-slate-400">Compare TSP contribution strategies with tax implications</div>
              </div>
            </li>
            <li className="flex items-start space-x-3">
              <Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
              <div>
                <div className="font-medium text-slate-700 dark:text-slate-300">PDF export (Pro)</div>
                <div className="text-slate-500 dark:text-slate-400">Download the Federal Retirement Projection Report</div>
              </div>
            </li>
          </ul>
        </div>

        <div className="card p-6">
          <h3 className="text-xl font-semibold navy-text mb-4">Important disclaimers</h3>
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
          Your plan answers "when could I leave, and will it hold" from one set of inputs. The calculators
          below go deeper on the TSP and the pension.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/plan" className="btn-primary">
            <span className="inline-flex items-center gap-2">
              <Map className="h-4 w-4" aria-hidden="true" />
              View my plan
            </span>
          </Link>
          <Link to="/tsp-forecast" className="btn-secondary">
            <span className="inline-flex items-center gap-2">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              TSP Forecast
            </span>
          </Link>
          <Link to="/fers-pension" className="btn-secondary">
            <span className="inline-flex items-center gap-2">
              <Landmark className="h-4 w-4" aria-hidden="true" />
              Calculate Pension
            </span>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>
          Built for federal employees •
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
