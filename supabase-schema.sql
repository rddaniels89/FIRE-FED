-- Create scenarios table for storing retirement scenarios
-- Run this SQL in your Supabase SQL Editor

-- Create the scenarios table
CREATE TABLE scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scenario_name TEXT NOT NULL,
  tsp_data JSONB,
  fers_data JSONB,
  fire_goal JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on user_id for faster queries
CREATE INDEX scenarios_user_id_idx ON scenarios(user_id);

-- Create an index on created_at for sorting
CREATE INDEX scenarios_created_at_idx ON scenarios(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to only see their own scenarios
CREATE POLICY "Users can view their own scenarios" ON scenarios
  FOR SELECT USING (auth.uid() = user_id);

-- Create policy to allow users to insert their own scenarios
CREATE POLICY "Users can insert their own scenarios" ON scenarios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update their own scenarios
CREATE POLICY "Users can update their own scenarios" ON scenarios
  FOR UPDATE USING (auth.uid() = user_id);

-- Create policy to allow users to delete their own scenarios
CREATE POLICY "Users can delete their own scenarios" ON scenarios
  FOR DELETE USING (auth.uid() = user_id);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_scenarios_updated_at
  BEFORE UPDATE ON scenarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for easier querying
CREATE VIEW user_scenarios AS
SELECT 
  id,
  user_id,
  scenario_name,
  tsp_data,
  fers_data,
  fire_goal,
  created_at,
  updated_at
FROM scenarios
WHERE user_id = auth.uid();

COMMENT ON TABLE scenarios IS 'Stores user retirement scenarios with TSP, FERS, and FIRE data';
COMMENT ON COLUMN scenarios.tsp_data IS 'JSON data for TSP calculations (contributions, balances, etc.)';
COMMENT ON COLUMN scenarios.fers_data IS 'JSON data for FERS pension calculations';
COMMENT ON COLUMN scenarios.fire_goal IS 'JSON data for FIRE goals (target age, income, etc.)';