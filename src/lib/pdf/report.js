const MM_A4 = Object.freeze({ width: 210, height: 297 });

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoneyUSD0(amount) {
  const n = clampNumber(amount, 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function safeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function addWrappedText(pdf, text, x, y, maxWidth, lineHeightMm) {
  const lines = pdf.splitTextToSize(safeText(text), maxWidth);
  for (const line of lines) {
    pdf.text(line, x, y);
    y += lineHeightMm;
  }
  return y;
}

function ensureSpace(pdf, y, neededMm, { top = 15, bottom = 15, headerMm = 14 } = {}) {
  const usableBottom = MM_A4.height - bottom;
  if (y + neededMm <= usableBottom) return y;
  pdf.addPage();
  return top + headerMm;
}

function drawHeader(pdf, { title, scenarioName }, { top = 15, left = 15, right = 15 } = {}) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text(safeText(title), left, top);

  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  const rightText = safeText(scenarioName);
  if (rightText) {
    const w = pdf.getTextWidth(rightText);
    pdf.text(rightText, MM_A4.width - right - w, top);
  }

  pdf.setDrawColor(226, 232, 240);
  pdf.line(left, top + 3, MM_A4.width - right, top + 3);
}

function drawFooter(pdf, { appName = 'FireFed', disclaimer }, { bottom = 12, left = 15, right = 15 } = {}) {
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    const footerY = MM_A4.height - bottom;
    pdf.text(`${appName} — Educational use only`, left, footerY);
    const pageText = `Page ${i} of ${pageCount}`;
    pdf.text(pageText, MM_A4.width - right - pdf.getTextWidth(pageText), footerY);

    if (disclaimer) {
      pdf.setFontSize(7.5);
      const maxWidth = MM_A4.width - left - right;
      const lines = pdf.splitTextToSize(safeText(disclaimer), maxWidth);
      const dy = 3.5;
      let y = footerY - dy * lines.length - 2;
      for (const line of lines) {
        pdf.text(line, left, y);
        y += dy;
      }
    }
  }
}

function addSectionTitle(pdf, title, y, { left = 15, right = 15, lineHeight = 6 } = {}) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  y = ensureSpace(pdf, y, 10);
  pdf.text(safeText(title), left, y);
  y += lineHeight;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(left, y - 2, MM_A4.width - right, y - 2);
  return y + 3;
}

function addKeyValueTable(pdf, rows, y, { left = 15, right = 15, labelWidth = 60, lineHeight = 5 } = {}) {
  const valueX = left + labelWidth;
  const maxValueWidth = MM_A4.width - right - valueX;

  pdf.setFontSize(10);
  for (const row of rows) {
    const label = safeText(row.label);
    const value = safeText(row.value);
    if (!label && !value) continue;

    y = ensureSpace(pdf, y, 8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text(label, left, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);
    const valueLines = pdf.splitTextToSize(value, maxValueWidth);
    for (const line of valueLines) {
      pdf.text(line, valueX, y);
      y += lineHeight;
      y = ensureSpace(pdf, y, 6);
    }
    y += 1.5;
  }
  return y;
}

function addBullets(pdf, bullets, y, { left = 18, right = 15, lineHeight = 4.5 } = {}) {
  const maxWidth = MM_A4.width - left - right;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  for (const b of bullets) {
    if (!b) continue;
    y = ensureSpace(pdf, y, 6);
    const lines = pdf.splitTextToSize(`• ${safeText(b)}`, maxWidth);
    for (const line of lines) {
      pdf.text(line, left, y);
      y += lineHeight;
      y = ensureSpace(pdf, y, 6);
    }
    y += 1;
  }
  return y;
}

export function createRetirementReportPdf({
  jsPDF,
  scenario,
  computed,
  settings,
  chartImages,
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 15;
  const right = 15;
  const top = 15;
  const headerMm = 14;

  const scenarioName = safeText(scenario?.name || 'Scenario');
  const generatedAt = safeText(computed?.generatedAt || new Date().toLocaleString());

  const detail = settings?.detailLevel || 'detailed';
  const includeCharts = Boolean(settings?.includeCharts);

  const disclaimer =
    'These estimates are educational and simplified. Always verify with official resources (TSP.gov / OPM) and consider professional advice.';

  pdf.setProperties({
    title: `FireFed Retirement Report - ${scenarioName}`,
    subject: 'Retirement summary report',
    author: 'FireFed',
  });

  // Cover
  pdf.setFillColor(241, 245, 249);
  pdf.rect(0, 0, MM_A4.width, 40, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Retirement Report', left, 22);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Scenario: ${scenarioName}`, left, 32);
  pdf.text(`Generated: ${generatedAt}`, left, 39);

  let y = 60;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Overview', left, y);
  y += 8;

  const overviewBullets = [
    `Total net worth at retirement (TSP + pension value proxy): ${formatMoneyUSD0(computed?.totalNetWorthAtRetirement)}`,
    `Estimated annual retirement income (pension + ${Math.round(clampNumber(computed?.swr, 0.04) * 100)}% TSP withdrawal + Social Security): ${formatMoneyUSD0(computed?.totalAnnualIncomeEstimate)}`,
    `Planned retirement age: ${safeText(computed?.plannedRetirementAge ?? '—')}`,
    `Projected FIRE age: ${safeText(computed?.projectedFireAge || '—')}`,
  ];
  y = addBullets(pdf, overviewBullets, y, { left: 18, right });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(71, 85, 105);
  y += 4;
  y = addWrappedText(pdf, disclaimer, left, y, MM_A4.width - left - right, 4.5);

  // Executive summary
  pdf.addPage();
  drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
  y = top + headerMm;
  y = addSectionTitle(pdf, 'Executive Summary', y, { left, right });

  y = addKeyValueTable(
    pdf,
    [
      { label: 'Total net worth at retirement', value: formatMoneyUSD0(computed?.totalNetWorthAtRetirement) },
      { label: 'TSP projected balance', value: formatMoneyUSD0(computed?.tspProjectedBalance) },
      { label: 'Estimated pension (monthly)', value: formatMoneyUSD0(computed?.pensionMonthly) },
      { label: 'Estimated pension (annual)', value: formatMoneyUSD0(computed?.pensionAnnual) },
      { label: 'Social Security (monthly)', value: formatMoneyUSD0(computed?.socialSecurityMonthly) },
      { label: 'Estimated annual retirement income', value: formatMoneyUSD0(computed?.totalAnnualIncomeEstimate) },
      { label: 'Income replacement (approx.)', value: safeText(computed?.incomeReplacementPct != null ? `${computed.incomeReplacementPct}%` : '—') },
    ],
    y,
    { left, right, labelWidth: 70 }
  );

  const eligibilityLines = Array.isArray(computed?.fersEligibilityMessages) ? computed.fersEligibilityMessages : [];
  if (eligibilityLines.length > 0) {
    y += 2;
    y = addSectionTitle(pdf, 'FERS Eligibility (simplified)', y, { left, right });
    y = addBullets(pdf, eligibilityLines, y, { left: 18, right });
  }

  // Assumptions
  pdf.addPage();
  drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
  y = top + headerMm;
  y = addSectionTitle(pdf, 'Assumptions & Sources', y, { left, right });

  y = addKeyValueTable(
    pdf,
    [
      { label: 'Safe withdrawal rate (SWR)', value: `${(clampNumber(computed?.swr, 0.04) * 100).toFixed(1)}%` },
      { label: 'Pension end age (life expectancy proxy)', value: safeText(computed?.pensionEndAge ?? '85') },
      { label: 'Social Security mode', value: safeText(computed?.socialSecurityMode ?? 'not_configured') },
      { label: 'Social Security claiming age', value: safeText(computed?.socialSecurityClaimingAge ?? '67') },
      { label: 'TSP value mode', value: safeText(computed?.tspValueMode ?? 'nominal') },
      { label: 'TSP inflation rate (if real mode used)', value: `${clampNumber(computed?.tspInflationRate, 0) || 0}%` },
    ],
    y,
    { left, right, labelWidth: 82 }
  );

  y += 2;
  y = addBullets(
    pdf,
    [
      'TSP projections are simplified and do not include all IRS rules, taxes, or withdrawal sequencing.',
      'FERS eligibility and reductions are simplified; FEHB nuances are not fully modeled.',
      'Social Security estimates are user-configured or a coarse heuristic; verify on SSA.gov.',
      'Always validate with official resources: TSP.gov and OPM retirement services.',
    ],
    y,
    { left: 18, right }
  );

  // Modules
  pdf.addPage();
  drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
  y = top + headerMm;
  y = addSectionTitle(pdf, 'TSP Module', y, { left, right });
  y = addKeyValueTable(
    pdf,
    [
      { label: 'Current age', value: safeText(computed?.tspCurrentAge) },
      { label: 'Retirement age', value: safeText(computed?.tspRetirementAge) },
      { label: 'Current balance', value: formatMoneyUSD0(computed?.tspCurrentBalance) },
      { label: 'Annual salary', value: formatMoneyUSD0(computed?.tspAnnualSalary) },
      { label: 'Employee contribution', value: safeText(computed?.tspEmployeeContributionPct != null ? `${computed.tspEmployeeContributionPct}%` : '—') },
      { label: 'Projected balance', value: formatMoneyUSD0(computed?.tspProjectedBalance) },
      { label: 'Total contributions', value: formatMoneyUSD0(computed?.tspTotalContributions) },
      { label: 'Total growth (est.)', value: formatMoneyUSD0(computed?.tspTotalGrowth) },
    ],
    y,
    { left, right, labelWidth: 70 }
  );
  if (detail === 'detailed') {
    const alloc = computed?.tspAllocation;
    if (alloc && typeof alloc === 'object') {
      y += 2;
      y = addBullets(
        pdf,
        [
          `Allocation: G ${alloc.G ?? 0}%, F ${alloc.F ?? 0}%, C ${alloc.C ?? 0}%, S ${alloc.S ?? 0}%, I ${alloc.I ?? 0}%`,
          `Contribution type: ${safeText(computed?.tspContributionType ?? 'traditional')}`,
        ],
        y,
        { left: 18, right }
      );
    }
  }

  pdf.addPage();
  drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
  y = top + headerMm;
  y = addSectionTitle(pdf, 'FERS Module', y, { left, right });
  y = addKeyValueTable(
    pdf,
    [
      { label: 'Current age', value: safeText(computed?.fersCurrentAge) },
      { label: 'Planned retirement age', value: safeText(computed?.plannedRetirementAge) },
      { label: 'Years of service (projected)', value: safeText(computed?.fersProjectedYearsOfService) },
      { label: 'High-3 salary', value: formatMoneyUSD0(computed?.fersHigh3Salary) },
      { label: 'Multiplier (simplified)', value: safeText(computed?.fersMultiplier != null ? `${(computed.fersMultiplier * 100).toFixed(2)}%` : '—') },
      { label: 'Annual pension', value: formatMoneyUSD0(computed?.pensionAnnual) },
      { label: 'Monthly pension', value: formatMoneyUSD0(computed?.pensionMonthly) },
      { label: 'Lifetime pension value proxy', value: formatMoneyUSD0(computed?.pensionLifetimeValue) },
    ],
    y,
    { left, right, labelWidth: 78 }
  );

  pdf.addPage();
  drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
  y = top + headerMm;
  y = addSectionTitle(pdf, 'FIRE & Bridge', y, { left, right });
  y = addKeyValueTable(
    pdf,
    [
      { label: 'Desired FIRE age', value: safeText(computed?.desiredFireAge) },
      { label: 'Projected FIRE age', value: safeText(computed?.projectedFireAge || '—') },
      { label: 'FIRE income goal (monthly)', value: formatMoneyUSD0(computed?.fireIncomeGoalMonthly) },
      { label: 'TSP withdrawal (monthly)', value: formatMoneyUSD0(computed?.tspMonthlyWithdrawal) },
      { label: 'Income before pension (monthly)', value: formatMoneyUSD0(computed?.monthlyIncomeBeforePension) },
      { label: 'Gap at desired age (monthly)', value: formatMoneyUSD0(computed?.monthlyGapAtDesiredAge) },
      { label: 'Bridge years (until pension starts)', value: safeText(computed?.bridgeYearsToBridge) },
      { label: 'Bridge assets needed (simple)', value: formatMoneyUSD0(computed?.bridgeRequiredAssets) },
    ],
    y,
    { left, right, labelWidth: 90 }
  );

  // Timeline
  pdf.addPage();
  drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
  y = top + headerMm;
  y = addSectionTitle(pdf, 'Timeline', y, { left, right });
  y = addKeyValueTable(
    pdf,
    [
      { label: 'Current age', value: safeText(computed?.tspCurrentAge ?? computed?.fersCurrentAge) },
      { label: 'MRA (assumed)', value: safeText(computed?.mra ?? '57') },
      { label: 'Earliest immediate FERS retirement age (est.)', value: safeText(computed?.earliestFersImmediateAge ?? '—') },
      { label: 'Planned retirement age', value: safeText(computed?.plannedRetirementAge ?? '—') },
      { label: 'Desired FIRE age', value: safeText(computed?.desiredFireAge ?? '—') },
      { label: 'Social Security claiming age', value: safeText(computed?.socialSecurityClaimingAge ?? '—') },
    ],
    y,
    { left, right, labelWidth: 95 }
  );

  if (detail === 'detailed') {
    y += 2;
    y = addBullets(
      pdf,
      [
        'Milestones to consider: age 60, 62, and your MRA.',
        'Eligibility is simplified; confirm with your agency/OPM for your specific case.',
      ],
      y,
      { left: 18, right }
    );
  }

  // Charts (optional)
  const hasCharts = includeCharts && chartImages && (chartImages.pensionVsTsp || chartImages.netWorth);
  if (hasCharts) {
    pdf.addPage();
    drawHeader(pdf, { title: 'FireFed Retirement Report', scenarioName }, { top, left, right });
    y = top + headerMm;
    y = addSectionTitle(pdf, 'Charts', y, { left, right });

    const maxWidth = MM_A4.width - left - right;
    const maxHeight = 95;
    const addImageBlock = (label, dataUrl) => {
      if (!dataUrl) return;
      y = ensureSpace(pdf, y, maxHeight + 18);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 42);
      pdf.text(safeText(label), left, y);
      y += 6;
      try {
        pdf.addImage(dataUrl, 'PNG', left, y, maxWidth, maxHeight, undefined, 'FAST');
      } catch {
        // If image embedding fails, skip (still a valid report).
      }
      y += maxHeight + 10;
    };

    addImageBlock('Pension vs TSP Share', chartImages.pensionVsTsp);
    addImageBlock('Net Worth Growth', chartImages.netWorth);
  }

  drawFooter(pdf, { appName: 'FireFed', disclaimer });
  return pdf;
}


