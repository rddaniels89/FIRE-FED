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

const AXIS_COLOR = '#64748b';
const GRID_COLOR = 'rgba(148, 163, 184, 0.25)';

function moneyTick(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1_000)}K`;
}

/**
 * The central chart: stacked income by source with outflows as a line, and a
 * second chart of the total balance. `mode` is 'nominal' or 'real'.
 */
export default function TimelineChart({ rows, mode = 'nominal', separationAge }) {
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
      plugins: {
        legend: { position: 'bottom', labels: { color: AXIS_COLOR, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            title: (items) => `Age ${items[0]?.label}${sepIndex >= 0 && Number(items[0]?.label) === separationAge ? ' (separation)' : ''}`,
            label: (item) => `${item.dataset.label}: ${fmtMoney(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { stacked: true, ticks: { color: AXIS_COLOR, maxTicksLimit: 14 }, grid: { display: false } },
        y: { stacked: true, ticks: { color: AXIS_COLOR, callback: moneyTick }, grid: { color: GRID_COLOR } },
      },
    }),
    [sepIndex, separationAge]
  );

  const balanceOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${fmtMoney(item.parsed.y)}` } },
      },
      scales: {
        x: { ticks: { color: AXIS_COLOR, maxTicksLimit: 14 }, grid: { display: false } },
        y: { ticks: { color: AXIS_COLOR, callback: moneyTick }, grid: { color: GRID_COLOR } },
      },
    }),
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Income by source, with outflows</div>
        <div className="h-72">
          <Bar data={incomeData} options={incomeOptions} />
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Total balance</div>
        <div className="h-44">
          <Line data={balanceData} options={balanceOptions} />
        </div>
      </div>
    </div>
  );
}
