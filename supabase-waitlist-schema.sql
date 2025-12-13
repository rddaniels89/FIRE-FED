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

-- Security note:
-- Do NOT add a public SELECT policy unless you explicitly want anyone to read the full waitlist.
-- Use Supabase service-role access (server-side) for admin reporting.

COMMENT ON TABLE waitlist IS 'Stores email addresses for Pro features waitlist';
COMMENT ON COLUMN waitlist.email IS 'User email address for Pro features notifications';
COMMENT ON COLUMN waitlist.submitted_at IS 'When user joined the waitlist';