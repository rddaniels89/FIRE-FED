function LegalDisclaimer() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold navy-text mb-6">Disclaimer</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p>
          FireFed provides estimates for educational purposes only. It is not an official government product and does
          not provide financial, legal, or tax advice.
        </p>
        <h2>Estimates only</h2>
        <p>
          Outputs depend on user inputs and simplified assumptions (such as projected returns and withdrawal rates).
          Actual outcomes may differ substantially.
        </p>
        <h2>Use official sources</h2>
        <p>
          For authoritative information, consult official sources such as OPM and TSP.gov, and/or a qualified
          professional advisor.
        </p>
      </div>
    </div>
  );
}

export default LegalDisclaimer;


