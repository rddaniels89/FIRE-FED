/**
 * Chart colours that work in both themes.
 *
 * Chart.js draws to a canvas, so it cannot inherit the `dark:` variants the
 * rest of the app uses. Every chart previously hard-coded slate-500 axes and
 * slate-200 gridlines, which measure about 2.6:1 on a dark card and fail
 * contrast, and one chart set no colours at all and fell back to a near-black
 * default that is invisible on dark.
 *
 * Pass `isDarkMode` from `useTheme()` and spread the result into the chart
 * options. Remember to include `isDarkMode` in the `useMemo` dependency array,
 * or the chart will keep the colours of whichever theme was active when it
 * first rendered.
 */

export function chartTheme(isDarkMode) {
  return {
    axis: isDarkMode ? '#94a3b8' : '#64748b',
    grid: isDarkMode ? 'rgba(148, 163, 184, 0.20)' : 'rgba(148, 163, 184, 0.35)',
    tooltipBackground: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)',
    tooltipText: isDarkMode ? '#e2e8f0' : '#0f172a',
    tooltipBorder: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.25)',
  };
}

/** Axis scale options with themed ticks and gridlines. */
export function themedScale(isDarkMode, { grid = true, ...rest } = {}) {
  const t = chartTheme(isDarkMode);
  return {
    ...rest,
    ticks: { color: t.axis, ...(rest.ticks ?? {}) },
    grid: grid ? { color: t.grid } : { display: false },
  };
}

/** Legend and tooltip plugin options with themed colours. */
export function themedPlugins(isDarkMode, { legend = {}, tooltip = {}, ...rest } = {}) {
  const t = chartTheme(isDarkMode);
  return {
    ...rest,
    legend: { ...legend, labels: { color: t.axis, ...(legend.labels ?? {}) } },
    tooltip: {
      backgroundColor: t.tooltipBackground,
      titleColor: t.tooltipText,
      bodyColor: t.tooltipText,
      borderColor: t.tooltipBorder,
      borderWidth: 1,
      ...tooltip,
    },
  };
}
