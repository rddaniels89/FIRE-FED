# FireFed - Complete Development Documentation

## Table of Contents

1. [Overview](#overview)
2. [Development](#development)
3. [Production](#production)
4. [Monetization](#monetization)
5. [Maintenance](#maintenance)
6. [Appendix](#appendix)

---

## Overview

### What is FireFed?

FireFed is a SaaS (Software as a Service) web application designed to help federal employees plan their financial independence and retirement. The application provides comprehensive tools for:

- **TSP (Thrift Savings Plan) Forecasting**: Calculate retirement savings growth with compound interest projections
- **FERS Pension Calculations**: Estimate Federal Employees Retirement System pension benefits
- **FIRE Planning**: Financial Independence Retire Early gap analysis and goal setting
- **Scenario Management**: Save, compare, and analyze multiple retirement scenarios
- **Summary Dashboard**: Combined analysis of all retirement projections

### Technology Stack

- **Frontend Framework**: React 19.1.0
- **Build Tool**: Vite 7.0.4
- **Routing**: React Router DOM 7.6.3
- **Styling**: Tailwind CSS 3.4.17
- **Backend/Database**: Supabase (PostgreSQL + Authentication)
- **Charts**: Chart.js 4.5.0 with react-chartjs-2
- **PDF Export**: jsPDF 3.0.1 + html2canvas 1.4.1
- **Language**: JavaScript (ES6+)
- **Package Manager**: npm

### Application Architecture

```
FireFed Application Structure
├── Frontend (React SPA)
│   ├── Components (UI Components)
│   ├── Contexts (State Management)
│   └── Supabase Client (Backend Integration)
├── Backend (Supabase)
│   ├── Authentication (Email/Password)
│   ├── Database (PostgreSQL)
│   └── Row Level Security (RLS)
└── Static Assets
    └── Build Output (Vite)
```

---

## Development

### Prerequisites

Before starting development, ensure you have:

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher (comes with Node.js)
- **Git**: For version control
- **Code Editor**: VS Code recommended
- **Supabase Account**: Free tier is sufficient for development

### Initial Setup

#### 1. Clone and Install Dependencies

```bash
# Clone the repository (if applicable)
git clone <repository-url>
cd fed-fire

# Install dependencies
npm install
```

#### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Important**: Never commit `.env` files to version control. Add `.env` to `.gitignore`.

#### 3. Supabase Setup

1. **Create Supabase Project**:
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Wait for project initialization (2-3 minutes)

2. **Get Credentials**:
   - Navigate to Settings > API
   - Copy `Project URL` and `anon public` key
   - Add to `.env` file

3. **Database Schema**:
   - Open SQL Editor in Supabase dashboard
   - Run `supabase-schema.sql` to create tables and policies
   - Run `supabase-waitlist-schema.sql` for waitlist functionality

4. **Authentication**:
   - Go to Authentication > Providers
   - Enable Email provider
   - Configure email templates (optional)

#### 4. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (default Vite port).

### Project Structure

```
fed-fire/
├── public/                 # Static assets
│   └── vite.svg
├── src/
│   ├── components/        # React components
│   │   ├── Auth.jsx       # Authentication UI
│   │   ├── HomePage.jsx   # Landing page
│   │   ├── TSPForecast.jsx # TSP calculator
│   │   ├── FERSPensionCalc.jsx # FERS calculator
│   │   ├── SummaryDashboard.jsx # Combined dashboard
│   │   ├── ScenariosPage.jsx # Scenario management
│   │   ├── ScenarioManager.jsx # Scenario CRUD
│   │   ├── ProFeatures.jsx # Pro features page
│   │   └── FIREGapCalculator.jsx # FIRE calculator
│   ├── contexts/          # React Context providers
│   │   ├── AuthContext.jsx # Authentication state
│   │   ├── ScenarioContext.jsx # Scenario state
│   │   └── ThemeContext.jsx # Dark/light theme
│   ├── App.jsx            # Main app component
│   ├── main.jsx           # Entry point
│   ├── index.css          # Global styles
│   └── supabaseClient.js  # Supabase client config
├── dist/                  # Build output (generated)
├── .env                   # Environment variables (not in git)
├── package.json           # Dependencies and scripts
├── vite.config.js         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── eslint.config.js       # ESLint configuration
├── supabase-schema.sql    # Database schema
├── supabase-waitlist-schema.sql # Waitlist table schema
└── README.md              # Basic project info
```

### Development Workflow

#### Code Organization

1. **Components**: Each major feature has its own component file
2. **Contexts**: Global state management using React Context API
3. **Styling**: Tailwind CSS utility classes with custom theme
4. **State Management**: React hooks (useState, useEffect, useContext)

#### Key Development Patterns

**Authentication Flow**:
```javascript
// User signs up/logs in → Supabase Auth → AuthContext updates → App re-renders
// Fallback to localStorage if Supabase unavailable
```

**Scenario Management**:
```javascript
// User creates/updates scenario → ScenarioContext → Debounced save to Supabase
// Automatic localStorage fallback for offline support
```

**Theme Management**:
```javascript
// Theme preference stored in localStorage → ThemeContext → Applied via Tailwind classes
```

### Development Scripts

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run ESLint
npm run lint
```

### Code Style Guidelines

1. **Component Structure**:
   - Use functional components with hooks
   - Keep components focused and single-purpose
   - Extract reusable logic into custom hooks

2. **Naming Conventions**:
   - Components: PascalCase (e.g., `TSPForecast.jsx`)
   - Functions: camelCase (e.g., `calculateTSPGrowth`)
   - Constants: UPPER_SNAKE_CASE (e.g., `MAX_SCENARIOS`)

3. **File Organization**:
   - One component per file
   - Related components in same directory
   - Contexts in separate `contexts/` directory

4. **Error Handling**:
   - Always use try-catch for async operations
   - Provide user-friendly error messages
   - Log errors to console for debugging

### Testing Locally

1. **Authentication Testing**:
   - Create test account via signup form
   - Verify email confirmation (if enabled)
   - Test login/logout flows

2. **Scenario Testing**:
   - Create multiple scenarios
   - Verify data persists after refresh
   - Test scenario deletion and renaming

3. **Feature Testing**:
   - Test all calculators with various inputs
   - Verify charts render correctly
   - Test PDF export functionality

### Common Development Tasks

#### Adding a New Component

1. Create component file in `src/components/`
2. Import and add route in `App.jsx`
3. Add navigation link if needed
4. Style with Tailwind CSS

#### Modifying Database Schema

1. Update `supabase-schema.sql`
2. Run SQL in Supabase SQL Editor
3. Update TypeScript types if using TypeScript
4. Update components that use the schema

#### Adding a New Context

1. Create context file in `src/contexts/`
2. Export provider and custom hook
3. Wrap app in provider in `App.jsx`
4. Use hook in components

---

## Production

### Build Process

#### 1. Pre-Build Checklist

- [ ] All environment variables configured
- [ ] Supabase project set to production
- [ ] Database schema deployed
- [ ] Authentication providers configured
- [ ] Error tracking configured (if applicable)
- [ ] Analytics configured (if applicable)

#### 2. Build Command

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory:
- Minified JavaScript
- Optimized CSS
- Asset optimization
- Code splitting

#### 3. Build Output

```
dist/
├── index.html          # Entry HTML file
├── assets/
│   ├── index-*.js     # Main JavaScript bundle
│   ├── index-*.css    # Main CSS bundle
│   └── *.svg          # Optimized images
```

### Environment Configuration

#### Production Environment Variables

Create `.env.production` (or configure in hosting platform):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key
```

**Security Notes**:
- Never expose service role keys in frontend
- Use anon key for client-side operations
- Enable Row Level Security (RLS) on all tables
- Configure CORS in Supabase dashboard

### Deployment Options

#### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Configure Environment Variables**:
   - Go to Vercel dashboard
   - Project Settings > Environment Variables
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

4. **Automatic Deployments**:
   - Connect GitHub repository
   - Deploy on every push to main branch

**Vercel Configuration** (`vercel.json`):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

#### Option 2: Netlify

1. **Install Netlify CLI**:
   ```bash
   npm i -g netlify-cli
   ```

2. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

3. **Configure** (`netlify.toml`):
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

#### Option 3: AWS S3 + CloudFront

1. **Build**:
   ```bash
   npm run build
   ```

2. **Upload to S3**:
   ```bash
   aws s3 sync dist/ s3://your-bucket-name --delete
   ```

3. **Configure CloudFront**:
   - Point to S3 bucket
   - Set default root object to `index.html`
   - Configure error pages (404 → index.html)

#### Option 4: GitHub Pages

1. **Install gh-pages**:
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Add Script** (`package.json`):
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

### Post-Deployment Checklist

- [ ] Verify application loads correctly
- [ ] Test authentication (signup/login)
- [ ] Verify database connections
- [ ] Test all major features
- [ ] Check mobile responsiveness
- [ ] Verify HTTPS is enabled
- [ ] Test error handling
- [ ] Verify analytics tracking (if applicable)

### Performance Optimization

#### Build Optimizations (Already Configured)

- **Code Splitting**: Automatic with Vite
- **Tree Shaking**: Unused code removed
- **Minification**: JavaScript and CSS minified
- **Asset Optimization**: Images optimized

#### Runtime Optimizations

1. **Lazy Loading**:
   ```javascript
   const Component = lazy(() => import('./Component'));
   ```

2. **Debouncing**:
   - Scenario updates debounced (1 second)
   - Search inputs debounced

3. **Memoization**:
   - Use `useMemo` for expensive calculations
   - Use `useCallback` for event handlers

### Monitoring and Analytics

#### Recommended Tools

1. **Error Tracking**: Sentry, LogRocket, or Rollbar
2. **Analytics**: Google Analytics, Plausible, or PostHog
3. **Performance**: Vercel Analytics, Web Vitals

#### Implementation Example (Sentry)

```javascript
// In main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production",
  integrations: [new Sentry.BrowserTracing()],
  tracesSampleRate: 0.1,
});
```

---

## Monetization

### Business Model

FireFed uses a **freemium SaaS model**:
- **Free Tier**: Basic calculators and limited scenarios
- **Pro Tier**: Advanced features, unlimited scenarios, PDF exports, AI insights

### Feature Gating Strategy

#### Current Implementation

Feature gating is handled in `AuthContext.jsx`:

```javascript
// Check if user has Pro subscription
const isProUser = () => {
  // Checks user metadata for 'pro' subscription
  return userMetadata.subscription_plan === 'pro';
};

// Check feature access
const hasFeature = (feature) => {
  const basicFeatures = ['scenario_comparison', 'pdf_export'];
  return isAuthenticated && basicFeatures.includes(feature);
};
```

#### Pro Features (Planned)

1. **Unlimited Scenarios**: Save and manage unlimited retirement scenarios
2. **PDF Export**: Generate professional retirement reports
3. **AI Insights**: Personalized retirement recommendations
4. **Advanced Analytics**: Monte Carlo simulations, detailed comparisons
5. **Optimization Suggestions**: TSP allocation and timeline recommendations
6. **Early Access**: New features and tools

### Payment Integration

#### Recommended: Stripe

**Setup Steps**:

1. **Create Stripe Account**:
   - Sign up at [stripe.com](https://stripe.com)
   - Get API keys (test and live)

2. **Install Stripe**:
   ```bash
   npm install @stripe/stripe-js @stripe/react-stripe-js
   ```

3. **Create Subscription Table** (Supabase):
   ```sql
   CREATE TABLE subscriptions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     stripe_customer_id TEXT UNIQUE,
     stripe_subscription_id TEXT UNIQUE,
     status TEXT, -- active, canceled, past_due
     plan TEXT, -- pro
     current_period_end TIMESTAMP,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

4. **Stripe Checkout Integration**:
   ```javascript
   // In ProFeatures.jsx
   import { loadStripe } from '@stripe/stripe-js';
   
   const stripePromise = loadStripe('pk_live_...');
   
   const handleUpgrade = async () => {
     const stripe = await stripePromise;
     const { error } = await stripe.redirectToCheckout({
       lineItems: [{ price: 'price_pro_monthly', quantity: 1 }],
       mode: 'subscription',
       successUrl: `${window.location.origin}/pro-features?success=true`,
       cancelUrl: `${window.location.origin}/pro-features?canceled=true`,
     });
   };
   ```

5. **Webhook Handler** (Supabase Edge Function or separate backend):
   ```javascript
   // Handle subscription events
   // Update user metadata when subscription changes
   ```

#### Alternative: Supabase Billing (Beta)

Supabase offers built-in billing integration:
- Configure in Supabase dashboard
- Automatic subscription management
- Integrated with Supabase Auth

### Pricing Strategy

#### Recommended Pricing Tiers

1. **Free**:
   - Basic TSP and FERS calculators
   - 3 saved scenarios
   - Basic charts and projections
   - Community support

2. **Pro - $9.99/month or $99/year**:
   - Unlimited scenarios
   - PDF export
   - AI-powered insights
   - Advanced analytics
   - Priority support
   - Early access to new features

#### Pricing Implementation

1. **Create Products in Stripe Dashboard**:
   - Pro Monthly: $9.99/month
   - Pro Annual: $99/year (save 17%)

2. **Update ProFeatures Component**:
   - Display pricing tiers
   - Add "Upgrade" buttons
   - Show feature comparison

3. **Subscription Management**:
   - Allow users to upgrade/downgrade
   - Handle cancellations
   - Prorate billing

### Waitlist Management

Current waitlist implementation:
- Users can join waitlist via `ProFeatures.jsx`
- Emails stored in `waitlist` table
- Can be used for email marketing campaigns

**Future Enhancements**:
- Email notifications when Pro launches
- Special discount codes for waitlist members
- Early access invitations

### Revenue Tracking

#### Recommended Metrics

1. **MRR (Monthly Recurring Revenue)**: Track monthly subscription revenue
2. **Churn Rate**: Percentage of users canceling
3. **Conversion Rate**: Free to Pro conversion
4. **LTV (Lifetime Value)**: Average revenue per user
5. **CAC (Customer Acquisition Cost)**: Cost to acquire new customers

#### Implementation

Use analytics tools or build custom dashboard:
- Track subscription events in database
- Create admin dashboard for metrics
- Set up alerts for key metrics

---

## Maintenance

### Monitoring

#### Application Health Checks

1. **Uptime Monitoring**:
   - Use services like UptimeRobot, Pingdom, or StatusCake
   - Monitor main application URL
   - Set up alerts for downtime

2. **Error Monitoring**:
   - Track JavaScript errors (Sentry, LogRocket)
   - Monitor API errors
   - Track user-reported issues

3. **Performance Monitoring**:
   - Track page load times
   - Monitor Core Web Vitals
   - Track API response times

#### Database Monitoring

1. **Supabase Dashboard**:
   - Monitor database size
   - Track query performance
   - Monitor connection pool usage

2. **Alerts**:
   - Set up alerts for high database usage
   - Monitor for slow queries
   - Track storage limits

### Regular Maintenance Tasks

#### Weekly

- [ ] Review error logs
- [ ] Check application performance metrics
- [ ] Review user feedback
- [ ] Monitor subscription metrics

#### Monthly

- [ ] Update dependencies (`npm audit`)
- [ ] Review and optimize database queries
- [ ] Analyze user behavior analytics
- [ ] Review and update documentation
- [ ] Backup database (if not automatic)

#### Quarterly

- [ ] Security audit
- [ ] Performance optimization review
- [ ] Feature usage analysis
- [ ] Pricing strategy review
- [ ] Competitive analysis

### Dependency Updates

#### Update Process

1. **Check for Updates**:
   ```bash
   npm outdated
   ```

2. **Update Dependencies**:
   ```bash
   # Update patch versions (safe)
   npm update
   
   # Update specific package
   npm install package-name@latest
   ```

3. **Test After Updates**:
   - Run test suite (if available)
   - Manual testing of key features
   - Check for breaking changes

4. **Security Updates**:
   ```bash
   npm audit
   npm audit fix
   ```

### Database Maintenance

#### Backup Strategy

1. **Automatic Backups** (Supabase):
   - Supabase Pro plan includes daily backups
   - Free plan: Manual backups recommended

2. **Manual Backup**:
   ```sql
   -- Export scenarios table
   pg_dump -h db.your-project.supabase.co -U postgres -d postgres -t scenarios > backup.sql
   ```

#### Database Optimization

1. **Index Maintenance**:
   - Review query performance
   - Add indexes for frequently queried columns
   - Remove unused indexes

2. **Data Cleanup**:
   - Archive old scenarios (if needed)
   - Remove test data
   - Clean up abandoned accounts

### Troubleshooting Guide

#### Common Issues

**1. Authentication Not Working**
- **Symptoms**: Users can't sign up or log in
- **Solutions**:
  - Check Supabase project status
  - Verify environment variables
  - Check browser console for errors
  - Verify email provider is enabled in Supabase

**2. Scenarios Not Saving**
- **Symptoms**: Data not persisting after refresh
- **Solutions**:
  - Check Supabase connection
  - Verify RLS policies are correct
  - Check browser console for errors
  - Verify user is authenticated

**3. Build Failures**
- **Symptoms**: `npm run build` fails
- **Solutions**:
  - Check for syntax errors
  - Verify all dependencies installed
  - Check Node.js version compatibility
  - Review build error messages

**4. Performance Issues**
- **Symptoms**: Slow page loads, laggy interactions
- **Solutions**:
  - Check bundle size (should be < 500KB)
  - Enable code splitting
  - Optimize images
  - Review database query performance

#### Debugging Tips

1. **Browser DevTools**:
   - Check Console for errors
   - Monitor Network tab for API calls
   - Use React DevTools for component debugging

2. **Supabase Logs**:
   - Check Supabase dashboard logs
   - Review API request logs
   - Check database query logs

3. **Environment Variables**:
   - Verify `.env` file exists
   - Check variable names (must start with `VITE_`)
   - Restart dev server after changes

### Scaling Considerations

#### When to Scale

- **User Growth**: > 1000 active users
- **Database Size**: > 1GB
- **API Limits**: Approaching Supabase limits
- **Performance**: Response times > 2 seconds

#### Scaling Strategies

1. **Database Scaling**:
   - Upgrade Supabase plan
   - Add read replicas
   - Optimize queries
   - Implement caching

2. **Frontend Scaling**:
   - Use CDN for static assets
   - Implement service workers for caching
   - Optimize bundle size
   - Use lazy loading

3. **Backend Scaling**:
   - Use Supabase Edge Functions for heavy operations
   - Implement rate limiting
   - Add caching layer (Redis)
   - Consider separate backend service

### Security Best Practices

1. **Environment Variables**:
   - Never commit `.env` files
   - Use different keys for dev/prod
   - Rotate keys regularly

2. **Authentication**:
   - Enable email verification
   - Implement password strength requirements
   - Use secure session management

3. **Database Security**:
   - Enable RLS on all tables
   - Use parameterized queries
   - Limit API access with RLS policies

4. **API Security**:
   - Use HTTPS only
   - Implement CORS properly
   - Rate limit API endpoints
   - Validate all user inputs

### Support and Documentation

#### User Support

1. **Support Channels**:
   - Email support (for Pro users)
   - Documentation site
   - FAQ page
   - Community forum (optional)

2. **Documentation**:
   - User guides
   - Video tutorials
   - API documentation (if applicable)

#### Developer Support

1. **Code Documentation**:
   - Inline comments for complex logic
   - README files for setup
   - Architecture diagrams

2. **Issue Tracking**:
   - Use GitHub Issues
   - Label issues (bug, feature, enhancement)
   - Maintain changelog

---

## Appendix

### A. Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### B. Database Schema Reference

#### Scenarios Table
```sql
CREATE TABLE scenarios (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  scenario_name TEXT NOT NULL,
  tsp_data JSONB,
  fers_data JSONB,
  fire_goal JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Waitlist Table
```sql
CREATE TABLE waitlist (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### C. Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^19.1.0 | UI framework |
| react-dom | ^19.1.0 | React DOM renderer |
| react-router-dom | ^7.6.3 | Client-side routing |
| @supabase/supabase-js | ^2.53.0 | Supabase client |
| chart.js | ^4.5.0 | Chart library |
| react-chartjs-2 | ^5.3.0 | React Chart.js wrapper |
| jspdf | ^3.0.1 | PDF generation |
| html2canvas | ^1.4.1 | HTML to canvas |
| tailwindcss | ^3.4.17 | CSS framework |
| vite | ^7.0.4 | Build tool |

### D. Useful Commands Cheat Sheet

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Run ESLint

# Dependencies
npm install              # Install dependencies
npm update               # Update dependencies
npm audit                # Check for vulnerabilities
npm audit fix            # Fix vulnerabilities

# Git
git status               # Check status
git add .                # Stage changes
git commit -m "message"  # Commit changes
git push                 # Push to remote
```

### E. Contact and Resources

- **Supabase Documentation**: https://supabase.com/docs
- **React Documentation**: https://react.dev
- **Vite Documentation**: https://vitejs.dev
- **Tailwind CSS Documentation**: https://tailwindcss.com/docs

### F. Changelog Template

```markdown
## [Version] - YYYY-MM-DD

### Added
- New feature description

### Changed
- Modified feature description

### Fixed
- Bug fix description

### Removed
- Removed feature description
```

---

## Document Version

- **Version**: 1.0.0
- **Last Updated**: 2024
- **Maintained By**: Development Team

---

**Note**: This documentation should be updated as the application evolves. Keep it synchronized with code changes and new features.

