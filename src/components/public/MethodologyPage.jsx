import { Link } from 'react-router-dom';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { listRulesByCategory } from '../../lib/rules/registry';

const REPO = 'https://github.com/rddaniels89/FIRE-FED';
const blob = (path) => `${REPO}/blob/main/${path}`;

/**
 * Worked examples where the expected figure is the authority's own, not
 * FireFed's. Each one is pinned by a test that runs on every change, so the
 * page cannot drift from what the code actually does without the build
 * failing. The test file is linked so anyone can read the assertion.
 */
const EXAMPLES = [
  {
    authority: 'OPM',
    title: 'The FERS supplement, OPM\'s own illustration',
    given: 'A $1,000 estimated Social Security benefit at 62 and 30 years of FERS service.',
    source: 'OPM divides 30 by 40 (0.75) and multiplies: $1,000 × 0.75 = $750 a month.',
    firefed: '$750.00',
    test: 'src/lib/calculations/__tests__/opmConformance.test.js',
    url: 'https://www.opm.gov/retirement-center/fers-information/types-of-retirement/',
  },
  {
    authority: 'OPM',
    title: 'Chart 7, the 1.1% accrual factor',
    given: 'A $100,000 High-3, 25 years of service, retiring at 62.',
    source: 'Handbook Chapter 50, Chart 7 gives a factor of 0.275 for 25 years at 1.1%: $27,500 a year.',
    firefed: '$27,500',
    test: 'src/lib/calculations/__tests__/opmDifferential.test.js',
    url: 'https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c050.pdf',
  },
  {
    authority: 'OPM',
    title: 'Unused sick leave, the handbook\'s example',
    given: '2,000 hours of unused sick leave.',
    source: 'Chapter 50 states 2,087 hours is one year and works the example to 11 months and 15 days.',
    firefed: '11.5 months',
    test: 'src/lib/calculations/__tests__/opmDifferential.test.js',
    url: 'https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c050.pdf',
  },
  {
    authority: 'OPM',
    title: 'Minimum retirement age, Chapter 51 Example 3',
    given: 'A retiree born in 1965.',
    source: 'The handbook states this retiree\'s MRA as "56 and 2 months".',
    firefed: '56 years 2 months',
    test: 'src/lib/calculations/__tests__/opmDifferential.test.js',
    url: 'https://www.opm.gov/retirement-center/publications-forms/csrsfers-handbook/c051.pdf',
  },
  {
    authority: 'OPM',
    title: 'The MRA+10 reduction',
    given: 'An annuity beginning at 57, five years under 62.',
    source: '5/12 of 1% for each full month under 62: 60 months × 5/12% = 25%.',
    firefed: '25%',
    test: 'src/lib/calculations/__tests__/opmConformance.test.js',
    url: 'https://www.opm.gov/retirement-center/fers-information/types-of-retirement/',
  },
  {
    authority: 'OPM',
    title: 'Survivor election',
    given: 'A $40,000 annuity with the full (50%) survivor benefit elected.',
    source: 'OPM: "If the total of the survivor benefit(s) you elect equals 50% of your benefit, your annuity is reduced by 10%."',
    firefed: '$36,000 to you; $20,000 to your survivor',
    test: 'src/lib/calculations/__tests__/opmConformance.test.js',
    url: 'https://www.opm.gov/retirement-center/fers-information/survivors/',
  },
  {
    authority: 'IRS',
    title: 'Taxable Social Security, Publication 915 Worksheet 1 Example 1',
    given: 'A single filer with $5,980 of benefits and $28,990 of other income.',
    source: 'The IRS works the sheet line by line to $2,990 of taxable benefits.',
    firefed: '$2,990',
    test: 'src/lib/taxes/__tests__/irsSsaDifferential.test.js',
    url: 'https://www.irs.gov/pub/irs-pdf/p915.pdf',
  },
  {
    authority: 'SSA',
    title: 'Claiming at 62 against full retirement age',
    given: 'A $1,000 benefit at full retirement age, claimed at 62, for each birth cohort.',
    source: 'SSA\'s table: $750, $741, $733, $725, $716, $708 and $700, after its round-down.',
    firefed: 'All seven, to the dollar',
    test: 'src/lib/taxes/__tests__/irsSsaDifferential.test.js',
    url: 'https://www.ssa.gov/benefits/retirement/planner/agereduction.html',
  },
];

/**
 * Defects the differential tests found in FireFed. Listed because a page that
 * only shows agreement is a brochure; the point is that the check is real.
 */
const FINDINGS = [
  {
    what: 'The minimum retirement age was hardcoded at 57.',
    effect:
      'OPM\'s table runs from 55 to 57 by year of birth. Anyone born 1965–1969 was told their MRA was up to ten months later than the law says, which delays every eligibility path that keys on it. Fixed: the MRA is now derived from the year of birth on OPM\'s table.',
    severity: 'High',
  },
  {
    what: 'Discontinued service retirement was not modeled.',
    effect:
      'An involuntarily separated employee qualifies for the supplement but is not paid until MRA (Handbook Chapter 51, Example 3). FireFed had no concept of the path and would have paid it immediately. Fixed.',
    severity: 'Medium',
  },
  {
    what: 'The Social Security delayed retirement credit was hardcoded at 8%.',
    effect:
      'SSA\'s rate rises from 3% to 8% by birth year. Nobody planning a federal retirement today is outside the 8% band, so no plausible user was affected. Fixed anyway.',
    severity: 'Low',
  },
];

const SIMPLIFICATIONS = [
  'Ages, not dates. FireFed stores your age in years and months, which pins your year of birth, but never collects the day. A 1 January birthday counts as the previous year under both OPM and SSA rules, so you declare it rather than FireFed inferring it.',
  'The High-3 at a future separation is projected from today\'s salary at an assumed growth rate, or from the GS career path when enabled. It is not a 36-month average of actual pay.',
  'The supplement uses OPM\'s published shorthand (the age-62 benefit prorated by service over 40). OPM\'s internal method rebuilds an indexed earnings history and applies the Social Security bend-point formula; that needs an earnings record FireFed deliberately does not collect.',
  'The 1.1% multiplier is keyed on age at separation. A deferred or postponed annuity that begins at 62 with 20 years is computed at 1.0%, the conservative reading of 5 U.S.C. 8415(h).',
  'Sick leave is converted at 2,087 hours to the year, linearly. OPM credits whole months and days from a chart, so results can differ by a few days of service.',
  'Roth TSP withdrawals are modeled as if rolled to a Roth IRA at separation, making contributions accessible first. The TSP itself pays pro rata.',
  'State income tax is a single effective rate with exemption flags, not a full state return.',
  'Social Security is taken from your SSA statement and grown with inflation; there is no wage indexing or bend-point computation.',
  'Required minimum distributions, and spousal or survivor Social Security benefits, are not modeled.',
];

function Authority({ children }) {
  return (
    <span className="inline-block text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-navy-50 text-navy-700 dark:bg-slate-700 dark:text-navy-300">
      {children}
    </span>
  );
}

function OutLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-navy-700 underline hover:text-navy-900 dark:text-navy-300"
    >
      {children}
      <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
    </a>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="mt-14 scroll-mt-20">
      <h2 className="text-2xl font-bold navy-text mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function MethodologyPage() {
  const rulesByCategory = listRulesByCategory();
  const ruleCount = rulesByCategory.reduce((n, g) => n + g.rules.length, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
      <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white text-balance">
        How we compute this
      </h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 max-w-3xl">
        A retirement number you cannot check is a guess with a decimal point. This page shows
        where every rule in FireFed comes from, the published examples it is tested against, and
        what those tests found when they were first run.
      </p>

      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {[
          ['#one-model', 'One model'],
          ['#examples', 'Tested against the source'],
          ['#findings', 'What the tests found'],
          ['#simplifications', 'Known simplifications'],
          ['#rules', `Every rule (${ruleCount})`],
          ['#reproduce', 'Check a number yourself'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="text-navy-700 dark:text-navy-300 hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="one-model" title="One model, one timeline">
        <div className="card p-6 space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            FireFed builds a single year-by-year timeline from the profile you enter: salary and
            FERS contributions while you work, then annuity, supplement, Social Security, TSP
            withdrawals, federal and state tax, FEHB and Medicare, and spending, through your plan
            end age. Every page — the summary, the projected separation age, comparisons, Monte
            Carlo, the PDF — reads from that one timeline.
          </p>
          <p>
            That is a deliberate constraint. Tools that compute the pension on one page and the
            withdrawal plan on another can quietly disagree about the year the supplement stops or
            when the 1.1% multiplier applies. Here there is one answer, and if it is wrong it is
            wrong everywhere, which is the kind of wrong a test can catch.
          </p>
        </div>
      </Section>

      <Section id="examples" title="Tested against the source, not against ourselves">
        <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-3xl leading-relaxed">
          Each example below takes a figure the authority itself published — a worked example in the
          CSRS/FERS Handbook, a filled-in IRS worksheet, an SSA table — and asserts that FireFed
          produces the same number. These assertions run with every change to the code. If a
          future edit breaks agreement with OPM, the build fails before it ships.
        </p>
        <div className="space-y-4">
          {EXAMPLES.map((ex) => (
            <div key={ex.title} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">{ex.title}</h3>
                <Authority>{ex.authority}</Authority>
              </div>
              <dl className="mt-3 grid sm:grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">Given</dt>
                <dd className="text-slate-700 dark:text-slate-300">{ex.given}</dd>
                <dt className="text-slate-500 dark:text-slate-400">{ex.authority} says</dt>
                <dd className="text-slate-700 dark:text-slate-300">{ex.source}</dd>
                <dt className="text-slate-500 dark:text-slate-400">FireFed</dt>
                <dd className="font-medium text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" strokeWidth={2} aria-hidden="true" />
                  {ex.firefed}
                </dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <OutLink href={ex.url}>Source</OutLink>
                <OutLink href={blob(ex.test)}>The test</OutLink>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          The full runs are written up in{' '}
          <OutLink href={blob('docs/DIFFERENTIAL-TESTING.md')}>docs/DIFFERENTIAL-TESTING.md</OutLink>: 48
          assertions against OPM, the IRS and SSA, with the sources read in full rather than through
          summaries.
        </p>
      </Section>

      <Section id="findings" title="What the tests found">
        <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-3xl leading-relaxed">
          A page that only lists agreements is a brochure. The first differential run against OPM
          found two defects in FireFed, and the IRS/SSA run found one. All three are fixed; they are
          listed here because a check that never finds anything is not a check.
        </p>
        <div className="space-y-3">
          {FINDINGS.map((f) => (
            <div key={f.what} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">{f.what}</h3>
                <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {f.severity}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{f.effect}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="simplifications" title="Known simplifications">
        <p className="text-slate-600 dark:text-slate-300 mb-4 max-w-3xl leading-relaxed">
          FireFed is a planning tool, not OPM’s adjudication system. These are the places it
          deliberately simplifies, so you know where your official estimate may differ.
        </p>
        <ol className="card p-6 space-y-3 list-decimal list-outside pl-10 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {SIMPLIFICATIONS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Section>

      <Section id="rules" title={`Every rule, with its source (${ruleCount})`}>
        <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-3xl leading-relaxed">
          This list is generated from the same registry the app reads when you click ⓘ beside a
          figure, so it cannot say something different from what the software does. Each rule
          carries the year its figures apply to and the date it was last checked against its source.
        </p>
        <div className="space-y-8">
          {rulesByCategory.map((g) => (
            <div key={g.category}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {g.label}
              </h3>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm sm:min-w-[36rem]">
                  <caption className="sr-only">{g.label} rules, with formula, source and verification date</caption>
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      <th scope="col" className="px-4 py-3 font-medium">Rule</th>
                      <th scope="col" className="px-4 py-3 font-medium">Source</th>
                      <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rules.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-white">{r.title}</div>
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{r.formula}</div>
                          {r.statute && (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{r.statute}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <OutLink href={r.source.url}>{r.source.name}</OutLink>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          <div>{r.ruleYear} rules</div>
                          <div className="text-xs">{r.lastVerified}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="reproduce" title="Check a number yourself">
        <div className="card p-6 space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            Every headline figure in FireFed has a <strong>How was this calculated</strong> control
            that shows the formula, the exact inputs it used, and the source. Compare it to the
            estimate your agency HR or OPM gave you; if they differ, the inputs section will usually
            show why — most often the High-3, the sick leave balance, or the survivor election.
          </p>
          <p>
            The code is public. Anyone can read the tests above, run them, or open an issue when
            they find a rule that is wrong:{' '}
            <OutLink href={REPO}>github.com/rddaniels89/FIRE-FED</OutLink>.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            FireFed is an educational planning tool. It models the rules you enter under stated
            assumptions and does not provide individualized financial advice. It is not affiliated
            with OPM, the TSP, the SSA, or any federal agency, and your official estimate comes from
            them, not from here.
          </p>
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link to="/calculators/fers-pension" className="btn-primary inline-flex items-center gap-1.5">
            Try the FERS calculator
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link to="/pricing" className="inline-flex items-center gap-1.5 px-4 py-2 font-medium navy-text">
            See what is free and what is Pro
          </Link>
        </div>
      </Section>
    </div>
  );
}
