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
        </ul>
        <h2>How we use data</h2>
        <p>
          Scenario data is used to power calculations and allow you to revisit plans. Waitlist email is used to notify
          you about Pro availability.
        </p>
        <h2>Analytics and error monitoring</h2>
        <p>
          If enabled, we may collect anonymous usage events and error reports to improve reliability and product
          experience. Configuration is controlled via environment variables.
        </p>
        <h2>Your choices</h2>
        <p>
          You can choose not to join the waitlist. You may delete scenarios you have created. For account deletion,
          contact support if applicable.
        </p>
      </div>
    </div>
  );
}

export default LegalPrivacy;


