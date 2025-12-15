-- Create subscriptions table for Pro billing (Stripe)
-- Run this SQL in your Supabase SQL Editor

-- This table is written by server-side Stripe webhooks (service role) and read by the client
-- to determine Pro entitlements. End-users should NOT be able to write to it.

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,

  plan TEXT NOT NULL DEFAULT 'pro',
  status TEXT NOT NULL, -- trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_end TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_status_idx ON subscriptions(status);

-- Enable Row Level Security (RLS)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own subscription row
CREATE POLICY "Users can view their own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Intentionally no INSERT/UPDATE/DELETE policies.
-- Stripe webhooks should use the service role key (server-side) to upsert rows.

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at_column();

COMMENT ON TABLE subscriptions IS 'Stores Stripe subscription state for each user (server-managed).';
COMMENT ON COLUMN subscriptions.user_id IS 'References auth.users.id; one subscription row per user.';
COMMENT ON COLUMN subscriptions.plan IS 'Subscription plan identifier (e.g., pro).';
COMMENT ON COLUMN subscriptions.status IS 'Stripe subscription status (active/trialing/etc).';
COMMENT ON COLUMN subscriptions.current_period_end IS 'Stripe current_period_end (billing period end).';


