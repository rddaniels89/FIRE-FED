function LegalPrivacy() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold navy-text mb-6">Privacy Policy</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p>
          This Privacy Policy explains how FireFed collects and uses information. This application is designed to store
          retirement scenarios you create, and—if you subscribe to Pro—the subscription status needed to unlock paid
          features.
        </p>
        <h2>Data we store</h2>
        <ul>
          <li>Account email (via Supabase authentication)</li>
          <li>Scenario data you save (TSP, FERS, FIRE inputs)</li>
          <li>Subscription status for Pro accounts (plan, status, renewal date, and Stripe customer/subscription identifiers)</li>
          <li>Basic device/browser data in error reports (when error monitoring is enabled)</li>
        </ul>
        <h2>Privacy by design</h2>
        <p>
          FireFed is built to need as little about you as possible. The calculations run on ages and dollar amounts,
          so that is all a scenario holds.
        </p>
        <ul>
          <li>
            <strong>Ages, not birth dates.</strong> FireFed stores your current age in years and months, your
            separation age, annuity start age and Social Security claiming age. It never asks for or stores a date of
            birth. The months are there because the FERS minimum retirement age and the Social Security full retirement
            age are both set by your year of birth, and an age in whole years cannot settle which year that is. Storing
            the months implies your month of birth, but never the day.
          </li>
          <li>
            <strong>No identifiers.</strong> FireFed never asks for a Social Security number, home address, employee
            ID, agency email address, TSP account number, Leave and Earnings Statement, or SF-50. If a field appears to
            ask for one of these, it is a bug &mdash; please report it.
          </li>
          <li>
            <strong>Names are optional.</strong> Scenarios are named by you (&ldquo;Retire at 57&rdquo;) and household
            members are modelled as &ldquo;Person A&rdquo; and &ldquo;Person B&rdquo;. A spouse&rsquo;s name is never
            requested.
          </li>
        </ul>
        <p>Exactly what a saved scenario contains:</p>
        <ul>
          <li>
            <strong>Scenario name</strong> &mdash; the label you chose.
          </li>
          <li>
            <strong>TSP block</strong> &mdash; balances (total and Roth), contribution percentage and type, salary and
            salary growth assumption, employer match settings, contribution limits in use, inflation assumption, fund
            allocation and expected fund returns, and the current and retirement tax rates you assume.
          </li>
          <li>
            <strong>FERS block</strong> &mdash; years and months of service, high-3 salary, unused sick leave hours,
            survivor election, annual leave hours at separation, whether you would take a refund of contributions, and
            military service years and deposit status.
          </li>
          <li>
            <strong>FIRE block</strong> &mdash; monthly income goal in retirement, side income and when it ends, annual
            taxable savings, brokerage and cash balances.
          </li>
          <li>
            <strong>Summary block</strong> &mdash; monthly expenses, Social Security settings (mode, claiming age,
            statement amount at full retirement age or a salary-based percentage, trust-fund assumption) and planning
            assumptions (end age, withdrawal rate, expected return, spending inflation). The same block carries the
            newer sections as <em>extensions</em>:
            <ul>
              <li><em>profile</em> &mdash; current age, separation age, annuity start age, Social Security claiming age, retirement path, whether an early-out is offered, employee type, FERS hire cohort, and minimum retirement age;</li>
              <li><em>household</em> &mdash; whether a second person is modelled, their age, income and when it ends, their Social Security and pension figures, and their federal service if any;</li>
              <li><em>taxes</em> &mdash; filing status and the state preset (code, effective rate, pension and Social Security treatment);</li>
              <li><em>healthcare</em> &mdash; FEHB enrollment type and years enrolled, TRICARE years, premium growth assumption, Medicare and IRMAA settings, marketplace premium, other coverage and out-of-pocket estimate;</li>
              <li><em>career</em> &mdash; GS grade, step, locality code, raise assumption and planned promotions;</li>
              <li><em>strategies</em> &mdash; 72(t) and Roth conversion settings.</li>
            </ul>
          </li>
        </ul>
        <p>Where it lives:</p>
        <ul>
          <li>
            <strong>Signed-in users</strong> &mdash; one row per scenario in a Supabase database (columns:
            scenario name, TSP block, FERS block, FIRE block, summary block with extensions), linked to your account by
            an internal user ID. Row-level security means only your account can read your rows.
          </li>
          <li>
            <strong>Everyone else</strong> &mdash; the same scenario object in your browser&rsquo;s localStorage on that
            device. It never leaves the device unless you sign in and choose to sync.
          </li>
          <li>
            <strong>Account email</strong> &mdash; held by Supabase authentication so you can sign in.
          </li>
          <li>
            <strong>Stripe customer ID</strong> &mdash; for Pro subscribers only, so FireFed can check subscription
            status. Card details stay with Stripe.
          </li>
        </ul>
        <h2>How we use data</h2>
        <p>
          Scenario data is used to power calculations and allow you to revisit plans. Subscription data is used solely
          to determine whether your account has access to Pro features and to manage billing.
        </p>
        <h2>Payments</h2>
        <p>
          Pro subscriptions are billed through Stripe. Card details are entered on Stripe&rsquo;s own checkout pages and
          are never sent to or stored by FireFed. We receive only the subscription status and identifiers needed to
          unlock paid features.
        </p>
        <h2>Local-only storage</h2>
        <p>
          Some data may be stored locally in your browser (for example: theme preference, onboarding checklist progress,
          and—when cloud sync is unavailable—scenario data). Local storage stays on your device unless you clear your
          browser data or use in-app reset options (if provided).
        </p>
        <h2>Analytics and error monitoring</h2>
        <p>
          If enabled, we may collect anonymous usage events and error reports to improve reliability and product
          experience. Configuration is controlled via environment variables.
        </p>
        <h2>Third-party processors</h2>
        <p>
          FireFed may use third-party services to operate the app:
        </p>
        <ul>
          <li>Authentication and database hosting (Supabase)</li>
          <li>Error monitoring (Sentry), if enabled</li>
          <li>Payment processing and subscription billing (Stripe)</li>
        </ul>
        <p>
          These providers process data on our behalf to deliver and maintain the service.
        </p>
        <h2>Data retention</h2>
        <p>
          We retain scenario data and account information for as long as your account is active or as needed to provide
          the service. Subscription records are retained while a subscription is active and afterwards where required for
          tax and accounting purposes. We retain error monitoring data only as long as necessary for debugging and
          reliability improvements.
        </p>
        <h2>Deletion and access requests</h2>
        <p>
          You can delete scenarios you have created within the app where supported. For account deletion or export
          requests, contact support (or the app owner) with the email address associated with your account. If you are
          using local-only mode (no cloud sync), clearing your browser storage will remove locally stored data on that
          device.
        </p>
        <h2>Your choices</h2>
        <p>
          You can use FireFed's free features without subscribing. You may delete scenarios you have created, and you
          can cancel a Pro subscription at any time from the billing portal. For account deletion, contact support if
          applicable.
        </p>
        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. Material changes will be posted in-app or on this page.
        </p>
      </div>
    </div>
  );
}

export default LegalPrivacy;


