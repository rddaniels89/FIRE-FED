-- Bring an existing `subscriptions` table up to what the Stripe webhook writes
-- Run this SQL in your Supabase SQL Editor

-- The webhook upserts these seven columns on every subscription event. A
-- project missing any of them rejects the whole write, and until the webhook
-- started checking its result that failure was invisible: Stripe received 200,
-- the event was recorded as processed, and a paying customer never got Pro.
--
-- Columns are added nullable here. The goal is to stop the rejection on an
-- existing table with rows in it, not to reproduce the original DDL exactly --
-- NOT NULL without a default cannot be added to a populated table.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE;

-- The webhook upserts with onConflict: 'user_id'. Without a unique constraint
-- on that column Postgres raises 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") and every event fails.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'subscriptions'::regclass
      AND c.contype IN ('u', 'p')
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'user_id'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verify: every column the webhook writes must appear here.
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'subscriptions' ORDER BY ordinal_position;
--
-- And confirm rows are actually arriving after a test purchase:
--
--   SELECT count(*), max(updated_at) FROM subscriptions;
