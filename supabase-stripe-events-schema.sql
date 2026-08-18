-- Idempotency ledger for Stripe webhooks
-- Run this SQL in your Supabase SQL Editor

-- Stripe retries webhooks and can deliver the same event more than once.
-- The webhook records each event id here before processing and skips replays.

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,                -- Stripe event id (evt_...)
  type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX stripe_events_created_at_idx ON stripe_events(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies: this table is written and read only by the
-- server-side webhook using the service role key.

COMMENT ON TABLE stripe_events IS 'Processed Stripe webhook event ids, used to drop duplicate deliveries.';
