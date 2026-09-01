-- Bring an existing `scenarios` table up to the current app schema
-- Run this SQL in your Supabase SQL Editor

-- Projects created before a column was added keep working until the app sends
-- that column, at which point PostgREST rejects the whole write:
--
--   PGRST204: Could not find the 'summary_data' column of 'scenarios'
--             in the schema cache
--
-- The client falls back to on-device storage, so the UI looks healthy while
-- nothing persists. This ran undetected in production for ~8 months.
--
-- Safe to run repeatedly: adding a nullable JSONB column does not rewrite the
-- table, and existing columns are left untouched.

ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS tsp_data JSONB,
  ADD COLUMN IF NOT EXISTS fers_data JSONB,
  ADD COLUMN IF NOT EXISTS fire_goal JSONB,
  ADD COLUMN IF NOT EXISTS summary_data JSONB;

-- PostgREST caches the schema; without this the next write can still 400.
NOTIFY pgrst, 'reload schema';

-- Verify: expect id, user_id, scenario_name, tsp_data, fers_data, fire_goal,
-- summary_data, created_at, updated_at.
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'scenarios' ORDER BY ordinal_position;
