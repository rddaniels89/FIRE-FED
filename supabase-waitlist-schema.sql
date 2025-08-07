-- Create waitlist table for Pro features
-- Run this SQL in your Supabase SQL Editor

-- Create the waitlist table
CREATE TABLE waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on email for faster lookups
CREATE INDEX waitlist_email_idx ON waitlist(email);

-- Create an index on submitted_at for sorting
CREATE INDEX waitlist_submitted_at_idx ON waitlist(submitted_at);

-- Enable Row Level Security (RLS) - Optional, or you can make it public for signups
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert (for public waitlist signups)
CREATE POLICY "Anyone can join waitlist" ON waitlist
  FOR INSERT WITH CHECK (true);

-- Create policy to allow reading own email (optional - for confirmation)
CREATE POLICY "Users can view their own waitlist entry" ON waitlist
  FOR SELECT USING (true);

-- Optional: Create a view for admin dashboard (if needed later)
CREATE VIEW waitlist_stats AS
SELECT 
  COUNT(*) as total_signups,
  COUNT(CASE WHEN submitted_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as signups_last_24h,
  COUNT(CASE WHEN submitted_at >= NOW() - INTERVAL '7 days' THEN 1 END) as signups_last_week,
  DATE_TRUNC('day', submitted_at) as signup_date,
  COUNT(*) as daily_signups
FROM waitlist
GROUP BY DATE_TRUNC('day', submitted_at)
ORDER BY signup_date DESC;

COMMENT ON TABLE waitlist IS 'Stores email addresses for Pro features waitlist';
COMMENT ON COLUMN waitlist.email IS 'User email address for Pro features notifications';
COMMENT ON COLUMN waitlist.submitted_at IS 'When user joined the waitlist';