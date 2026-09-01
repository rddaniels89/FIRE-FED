# Supabase Setup for FireFed

This guide explains how to set up Supabase authentication and database for the FireFed React app.

## Prerequisites

1. A Supabase account at [supabase.com](https://supabase.com)
2. A new Supabase project created

## Setup Steps

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose your organization and fill in project details
4. Wait for the project to be set up

### 2. Get Your Project Credentials

1. In your Supabase dashboard, go to Settings > API
2. Copy your Project URL and anon public key
3. Update your `.env` file with these values:

```bash
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 3. Set Up the Database Schema

1. In your Supabase dashboard, go to the SQL Editor
2. Copy and paste the contents of `supabase-schema.sql` into the editor
3. Click "Run" to execute the SQL

This will create:
- A `scenarios` table for storing user retirement scenarios
- Row Level Security (RLS) policies to ensure users can only access their own data
- Proper indexes for performance

Then run the remaining schema files the same way:

| File | Creates | Needed for |
| --- | --- | --- |
| `supabase-subscriptions-schema.sql` | `subscriptions` | Pro entitlements (written by the Stripe webhook) |
| `supabase-stripe-events-schema.sql` | `stripe_events` | Dropping duplicate Stripe webhook deliveries |
| `supabase-snapshots-schema.sql` | `scenario_snapshots` | Daily plan history (one row per scenario per UTC day) |

`subscriptions` and `stripe_events` are written only by the server-side webhook
using the service role key, so neither has an INSERT/UPDATE policy. Never expose
`SUPABASE_SERVICE_ROLE_KEY` to the client.

### 3b. Keeping an existing project in sync

Schema files above create tables from scratch. A project created before a column
was added keeps working until the app sends that column, at which point
PostgREST rejects the entire write:

```
PGRST204: Could not find the 'summary_data' column of 'scenarios' in the schema cache
```

**This fails silently in the UI.** Scenario writes fall back to on-device
storage, so the app looks healthy while nothing reaches the database. Exactly
this went unnoticed in production for roughly eight months — `scenarios` stopped
accepting writes in December and no one saw it until the row count was checked
directly.

Run `supabase-scenarios-columns-migration.sql` against any existing project. It
is idempotent and additive, so it is safe on a database already in the right
shape.

Two habits that keep this from recurring:

- **Whenever you add a field to a scenario, add the column to every project**,
  not just the newest one. Check with:

  ```sql
  select column_name, data_type from information_schema.columns
  where table_name = 'scenarios' order by ordinal_position;
  ```

- **Confirm writes are actually landing** after any schema change, rather than
  trusting the UI:

  ```sql
  select count(*), max(updated_at) from scenarios;
  ```

  A `max(updated_at)` that stopped moving is the signature of this failure.

Since the app now surfaces rejected writes with an in-app banner (see
`src/components/CloudSyncBanner.jsx`), a future drift should announce itself —
but the queries above remain the fastest way to confirm.

### 4. Configure Authentication

Authentication is automatically configured through Supabase Auth. The app supports:
- Email/password signup and login
- Automatic session management
- Secure password reset flows

### 5. Test the Integration

1. Start your development server: `npm run dev`
2. Navigate to the app in your browser
3. Try signing up with a test email
4. Check your email for the confirmation link
5. Sign in and create some scenarios
6. Verify the data appears in your Supabase dashboard under "Table Editor"

## Features Implemented

✅ **Authentication**
- Email/password signup and login
- Session persistence across browser refreshes
- Secure logout functionality
- Guest mode fallback when Supabase is unavailable

✅ **Scenario Management**
- Save retirement scenarios to Supabase
- Load all user scenarios on login
- Real-time scenario updates with debouncing
- Delete and rename scenarios
- Duplicate scenarios

✅ **Fallback Support**
- Graceful degradation when Supabase is unavailable
- localStorage fallback for guest users
- Session-only data when not authenticated

## Data Structure

Each scenario in Supabase contains:
- `user_id`: Links to the authenticated user
- `scenario_name`: User-defined name for the scenario
- `tsp_data`: JSON object with TSP calculation data
- `fers_data`: JSON object with FERS pension data
- `fire_goal`: JSON object with FIRE retirement goals
- `created_at`/`updated_at`: Automatic timestamps

## Security

- Row Level Security (RLS) ensures users can only access their own scenarios
- Anonymous access is disabled for the scenarios table
- All database operations require authentication
- Environment variables keep API keys secure

## Troubleshooting

**Auth not working?**
- Check your environment variables are correct
- Ensure your Supabase project URL and key are valid
- Check the browser console for error messages

**Scenarios not saving?**
- Look for the in-app banner: a rejected write now names the reason
- `PGRST204` in the console means the database is missing a column — run
  `supabase-scenarios-columns-migration.sql` (see "Keeping an existing project
  in sync" above)
- Confirm writes are landing with `select count(*), max(updated_at) from scenarios;`
  rather than trusting the UI
- Check the RLS policies are enabled
- Confirm the app and your SQL Editor are pointed at the *same* Supabase
  project — `VITE_SUPABASE_URL` must match the project ref in the dashboard URL

**Guest mode issues?**
- The app will automatically fall back to localStorage
- Guest data is only stored locally and won't sync across devices
- Guest mode is indicated in the UI