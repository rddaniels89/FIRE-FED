import { useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { useTheme } from '../../contexts/ThemeContext';
import { themedPlugins, themedScale } from '../../lib/charts/theme';
import { fmtMoney, SOURCE_COLORS } from './planFormat';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, Tooltip, Legend);

const INCOME_SOURCES = [
  { key: 'salary', label: 'Salary', pick: (r) => r.salary },
  { key: 'pension', label: 'FERS annuity', pick: (r) => r.pension },
  { key: 'srs', label: 'Supplement', pick: (r) => r.srs },
  { key: 'socialSecurity', label: 'Social Security', pick: (r) => r.socialSecurity },
  { key: 'spouseIncome', label: 'Spouse income', pick: (r) => r.spouseIncome },
  { key: 'spouseSocialSecurity', label: 'Spouse SS', pick: (r) => r.spouseSocialSecurity },
  { key: 'spousePension', label: 'Spouse pension', pick: (r) => r.spousePension },
  { key: 'sideHustle', label: 'Side income', pick: (r) => r.sideHustle },
  { key: 'withdrawals', label: 'Withdrawals', pick: (r) => r.withdrawals.total },
];

// The legend can carry ten entries, which wraps to five or six rows on a
// phone; smaller boxes and type keep it to two or three.
const LEGEND = { position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 10 } } };

function moneyTick(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1_000)}K`;
}

const outflowOf = (r) => r.spending + r.healthcare.total + r.taxes.total;

/** The stacked-income chart in a sentence: the sources, the span, the crossover. */
function describeIncome(rows, datasets, deflate) {
  if (!rows.length) return 'Income by source: no years to show.';
  const first = rows[0].age;
  const last = rows[rows.length - 1].age;
  const sources = datasets.filter((d) => d.type !== 'line').map((d) => d.label);
  const crossing = rows.find((r) => {
    const income = INCOME_SOURCES.reduce((sum, s) => sum + (Number(s.pick(r)) || 0), 0);
    return deflate(outflowOf(r), r) > deflate(income, r);
  });
  const parts = [`Income by source from age ${first} to ${last}`];
  if (sources.length) parts.push(`sources: ${sources.join(', ')}`);
  parts.push(
    crossing
      ? `spending exceeds income from age ${crossing.age}`
      : 'income covers spending in every year'
  );
  return `${parts.join('; ')}.`;
}

/** The balance chart in a sentence: start, end, and the low point. */
function describeBalance(rows, deflate, mode) {
  if (!rows.length) return 'Total balance: no years to show.';
  const at = (r) => deflate(r.balances.total, r);
  const low = rows.reduce((min, r) => (at(r) < at(min) ? r : min), rows[0]);
  const basis = mode === 'real' ? "in today's dollars" : 'in nominal dollars';
  return `Total balance ${basis} from age ${rows[0].age} to ${rows[rows.length - 1].age}: ${fmtMoney(
    at(rows[0])
  )} at the start, ${fmtMoney(at(rows[rows.length - 1]))} at the end, lowest ${fmtMoney(at(low))} at age ${low.age}.`;
}

/**
 * The central chart: stacked income by source with outflows as a line, and a
 * second chart of the total balance. `mode` is 'nominal' or 'real'.
 */
export default function TimelineChart({ rows, mode = 'nominal', separationAge, describedById }) {
  const { isDarkMode } = useTheme();
  const deflate = useMemo(
    () => (mode === 'real' ? (v, r) => v / (r.real?.deflator || 1) : (v) => v),
    [mode]
  );

  const labels = useMemo(() => rows.map((r) => String(r.age)), [rows]);

  const incomeData = useMemo(() => {
    const datasets = INCOME_SOURCES.map((src) => ({
      label: src.label,
      data: rows.map((r) => Math.round(deflate(src.pick(r), r))),
      backgroundColor: SOURCE_COLORS[src.key],
      stack: 'income',
      borderWidth: 0,
    })).filter((ds) => ds.data.some((v) => v > 0));

    datasets.push({
      type: 'line',
      label: 'Spending + healthcare + taxes',
      data: rows.map((r) => Math.round(deflate(r.spending + r.healthcare.total + r.taxes.total, r))),
      borderColor: SOURCE_COLORS.outflow,
      backgroundColor: SOURCE_COLORS.outflow,
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 6,
      tension: 0.2,
      order: 0,
    });

    return { labels, datasets };
  }, [rows, labels, deflate]);

  const balanceData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: mode === 'real' ? "Total balance (today's dollars)" : 'Total balance',
          data: rows.map((r) => Math.round(deflate(r.balances.total, r))),
          borderColor: SOURCE_COLORS.balance,
          backgroundColor: 'rgba(15, 118, 110, 0.15)',
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 6,
          tension: 0.2,
        },
      ],
    }),
    [rows, labels, deflate, mode]
  );

  const sepIndex = rows.findIndex((r) => r.age === separationAge);

  const incomeOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: themedPlugins(isDarkMode, {
        legend: LEGEND,
        tooltip: {
          callbacks: {
            title: (items) => `Age ${items[0]?.label}${sepIndex >= 0 && Number(items[0]?.label) === separationAge ? ' (separation)' : ''}`,
            label: (item) => `${item.dataset.label}: ${fmtMoney(item.parsed.y)}`,
          },
        },
      }),
      scales: {
        x: themedScale(isDarkMode, { stacked: true, ticks: { maxTicksLimit: 14 }, grid: false }),
        y: themedScale(isDarkMode, { stacked: true, ticks: { callback: moneyTick } }),
      },
    }),
    [sepIndex, separationAge, isDarkMode]
  );

  const balanceOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: themedPlugins(isDarkMode, {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtMoney(item.parsed.y)}` } },
      }),
      scales: {
        x: themedScale(isDarkMode, { ticks: { maxTicksLimit: 14 }, grid: false }),
        y: themedScale(isDarkMode, { ticks: { callback: moneyTick } }),
      },
    }),
    [isDarkMode]
  );

  // A canvas has no text, so each chart states its own reading. react-chartjs-2
  // spreads unknown props onto the canvas element.
  const incomeLabel = useMemo(() => describeIncome(rows, incomeData.datasets, deflate), [rows, incomeData, deflate]);
  const balanceLabel = useMemo(() => describeBalance(rows, deflate, mode), [rows, deflate, mode]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Income by source, with outflows</div>
        <div className="h-72 sm:h-80">
          <Bar
            data={incomeData}
            options={incomeOptions}
            role="img"
            aria-label={incomeLabel}
            aria-describedby={describedById}
          />
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Total balance</div>
        <div className="h-44">
          <Line
            data={balanceData}
            options={balanceOptions}
            role="img"
            aria-label={balanceLabel}
            aria-describedby={describedById}
          />
        </div>
      </div>
    </div>
  );
}
