import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import { ISSUE_SEVERITY, MILITARY_RESULT_STATUS, labelForStatus } from '../../lib/military/status';

const STYLE = {
  [ISSUE_SEVERITY.BLOCK]: {
    Icon: OctagonAlert,
    box: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100',
    label: 'Stops the calculation',
  },
  [ISSUE_SEVERITY.WARNING]: {
    Icon: AlertTriangle,
    box: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100',
    label: 'Check this',
  },
  [ISSUE_SEVERITY.INFO]: {
    Icon: Info,
    box: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
    label: 'Note',
  },
};

const ORDER = [ISSUE_SEVERITY.BLOCK, ISSUE_SEVERITY.WARNING, ISSUE_SEVERITY.INFO];

/**
 * The issue list every military screen shares. Codes are stable so support,
 * the PDF, and the tests can quote them; the message says what, the
 * remediation says who decides or what to enter, and the source is official.
 * Nothing here is ever hidden behind a paywall.
 */
export default function MilitaryIssues({ issues = [], compact = false, className = '' }) {
  const list = [...issues].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  if (list.length === 0) return null;
  return (
    <ul className={`space-y-2 ${className}`} aria-label="Issues and notes">
      {list.map((issue, i) => {
        const s = STYLE[issue.severity] ?? STYLE[ISSUE_SEVERITY.INFO];
        const { Icon } = s;
        return (
          <li key={`${issue.code}-${issue.entity?.id ?? i}`} className={`rounded-lg border p-3 text-sm ${s.box}`} data-issue-code={issue.code}>
            <div className="flex items-start gap-2">
              <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-medium">
                  <span className="sr-only">{s.label}: </span>
                  {issue.message}
                </div>
                {!compact && issue.remediation ? <div className="mt-1 text-xs opacity-90">{issue.remediation}</div> : null}
                {!compact && issue.source ? (
                  <a href={issue.source} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline underline-offset-2">
                    Official source
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const BADGE = {
  [MILITARY_RESULT_STATUS.SUPPORTED]: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  [MILITARY_RESULT_STATUS.SUPPORTED_WITH_OFFICIAL_AMOUNT]: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  [MILITARY_RESULT_STATUS.ESTIMATE_ONLY]: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  [MILITARY_RESULT_STATUS.OFFICIAL_DETERMINATION_REQUIRED]: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  [MILITARY_RESULT_STATUS.NOT_SUPPORTED]: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

/** The result label (§5.9) as a small badge. Text carries the meaning; colour is secondary. */
export function StatusBadge({ status, label }) {
  const text = label ?? labelForStatus(status);
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status] ?? BADGE[MILITARY_RESULT_STATUS.NOT_SUPPORTED]}`}>
      {text}
    </span>
  );
}

/** The non-affiliation and educational notice the spec puts near every military result. */
export function MilitaryNotice({ className = '' }) {
  return (
    <p className={`text-xs text-slate-500 dark:text-slate-400 ${className}`}>
      FireFed provides planning estimates. Your service, employing agency, OPM, DFAS, VA, TSP, Medicare, and TRICARE make
      official eligibility and payment decisions. FireFed is not affiliated with or endorsed by those agencies.
    </p>
  );
}
