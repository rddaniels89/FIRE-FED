function LegalPrivacy() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold navy-text mb-6">Privacy Policy</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p>
          This Privacy Policy explains how FireFed collects and uses information. This application is designed to store
          retirement scenarios you create and optionally an email address for the Pro waitlist.
        </p>
        <h2>Data we store</h2>
        <ul>
          <li>Account email (via Supabase authentication)</li>
          <li>Scenario data you save (TSP, FERS, FIRE inputs)</li>
          <li>Waitlist email (if you join the Pro waitlist)</li>
          <li>Basic device/browser data in error reports (when error monitoring is enabled)</li>
        </ul>
        <h2>How we use data</h2>
        <p>
          Scenario data is used to power calculations and allow you to revisit plans. Waitlist email is used to notify
          you about Pro availability.
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
        </ul>
        <p>
          These providers process data on our behalf to deliver and maintain the service.
        </p>
        <h2>Data retention</h2>
        <p>
          We retain scenario data and account information for as long as your account is active or as needed to provide
          the service. Waitlist submissions are retained until the waitlist is no longer needed or you request removal.
          We retain error monitoring data only as long as necessary for debugging and reliability improvements.
        </p>
        <h2>Deletion and access requests</h2>
        <p>
          You can delete scenarios you have created within the app where supported. For account deletion, export requests,
          or removal from the waitlist, contact support (or the app owner) with the email address associated with your
          account. If you are using local-only mode (no cloud sync), clearing your browser storage will remove locally
          stored data on that device.
        </p>
        <h2>Your choices</h2>
        <p>
          You can choose not to join the waitlist. You may delete scenarios you have created. For account deletion,
          contact support if applicable.
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


