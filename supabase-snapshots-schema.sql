-- Plan-over-time history for saved scenarios
-- Run this SQL in your Supabase SQL Editor

-- Scenarios are stored mutate-in-place, so the row only ever shows the current
-- plan. This table keeps the daily history a "your January plan vs. now" view
-- needs. History cannot be backfilled, so writes start before that view exists.

CREATE TABLE scenario_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  snapshot_date DATE NOT NULL,        -- UTC calendar day the plan was in this state
  scenario_name TEXT,
  tsp_data JSONB,
  fers_data JSONB,
  fire_goal JSONB,
  summary_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Scenario edits autosave continuously. Without this the table becomes an
  -- edit log; with it, a day collapses to one row holding that day's end state.
  UNIQUE (scenario_id, snapshot_date)
);

-- Serves the read this table exists for: one scenario's history, newest first.
CREATE INDEX scenario_snapshots_scenario_date_idx
  ON scenario_snapshots(scenario_id, snapshot_date DESC);

CREATE INDEX scenario_snapshots_user_id_idx ON scenario_snapshots(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE scenario_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own snapshots" ON scenario_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own snapshots" ON scenario_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- The daily upsert rewrites the current day's row, so UPDATE is required.
CREATE POLICY "Users can update their own snapshots" ON scenario_snapshots
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own snapshots" ON scenario_snapshots
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE scenario_snapshots IS 'Daily history of saved scenarios; one row per scenario per UTC day.';
COMMENT ON COLUMN scenario_snapshots.snapshot_date IS 'UTC calendar day. Unique per scenario, so a day holds that day''s final state.';
