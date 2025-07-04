# Supabase Schema for GRMTek Sporeless Pilot Program

This directory contains the SQL scripts needed to set up the database schema for the GRMTek Sporeless Pilot Program application.

## Setup Instructions

### 1. Create a new Supabase Project

1. Go to [Supabase](https://supabase.com/) and sign in or create an account
2. Create a new project
3. Note down your project URL and anon key

### 2. Update Environment Variables

1. Update the `.env` file with your Supabase URL and anon key:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Execute the Schema SQL

1. Navigate to the SQL Editor in your Supabase dashboard
2. Copy the contents of `schema.sql` and paste it into a new SQL query
3. Run the query to create all tables, functions, triggers, and policies

### 4. Verify the Setup

1. Check the Tables section to ensure all tables have been created:
   - pilot_programs
   - sites
   - submissions
   - petri_observations
   - pilot_program_users

2. Check the Storage section to ensure the `petri-images` bucket has been created

## Schema Structure

The database follows a hierarchical structure:

1. `pilot_programs` - Parent table for all pilot programs
2. `sites` - Child table of pilot_programs
3. `submissions` - Child table of sites
4. `petri_observations` - Child table of submissions
5. `pilot_program_users` - Junction table linking users to programs

Row Level Security (RLS) is enabled on all tables to ensure users can only access data they have permission to view.

## Functions and Triggers

The schema includes several functions and triggers:

- `set_updated_at()` - Updates the updated_at timestamp on record changes
- `set_submission_program_id()` - Automatically sets the program_id on submissions
- `set_petri_site_id()` - Automatically sets the site_id on petri observations
- `update_program_status()` - Updates program status based on dates
- `increment_pilot_program_sites()` - Increments the site count for a program
- `increment_pilot_program_submissions()` - Increments the submission count for a program
- `increment_site_petris()` - Increments the petri count for a site

These functions ensure data integrity and maintain proper rollup counts across the hierarchical structure.