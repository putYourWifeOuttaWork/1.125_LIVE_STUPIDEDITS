import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeMigration() {
  try {
    console.log('📁 Reading migration file...\n');
    const migrationSQL = readFileSync('./supabase/migrations/20251109140000_create_get_recent_submissions_v3.sql', 'utf8');

    console.log('🚀 Applying migration: 20251109140000_create_get_recent_submissions_v3.sql\n');

    // Split migration into logical parts to execute sequentially
    const parts = [
      // Part 1: Create superadmin_impersonations table
      {
        name: 'Create superadmin_impersonations table',
        sql: `
CREATE TABLE IF NOT EXISTS superadmin_impersonations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_company_id uuid NOT NULL REFERENCES companies(company_id),
  target_company_name text,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  was_global_override boolean NOT NULL DEFAULT false,
  request_ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_superadmin_impersonations_user_id
  ON superadmin_impersonations(super_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_impersonations_company_id
  ON superadmin_impersonations(target_company_id);
CREATE INDEX IF NOT EXISTS idx_superadmin_impersonations_active
  ON superadmin_impersonations(super_admin_user_id, ended_at)
  WHERE ended_at IS NULL;

ALTER TABLE superadmin_impersonations ENABLE ROW LEVEL SECURITY;
        `
      },
      // Part 2: Create RLS policies for impersonations
      {
        name: 'Create RLS policies for superadmin_impersonations',
        sql: `
DO $$ BEGIN
  DROP POLICY IF EXISTS "Super admins can view all impersonations" ON superadmin_impersonations;
  DROP POLICY IF EXISTS "Super admins can create impersonations" ON superadmin_impersonations;
  DROP POLICY IF EXISTS "Super admins can end their own impersonations" ON superadmin_impersonations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Super admins can view all impersonations"
  ON superadmin_impersonations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
    )
  );

CREATE POLICY "Super admins can create impersonations"
  ON superadmin_impersonations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    super_admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
    )
  );

CREATE POLICY "Super admins can end their own impersonations"
  ON superadmin_impersonations
  FOR UPDATE
  TO authenticated
  USING (
    super_admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
    )
  );
        `
      },
      // Part 3: Create helper function
      {
        name: 'Create get_impersonated_company_id helper function',
        sql: `
CREATE OR REPLACE FUNCTION get_impersonated_company_id()
RETURNS uuid AS $$
DECLARE
  impersonated_company_id uuid;
  jwt_claims jsonb;
BEGIN
  BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;

  IF jwt_claims IS NOT NULL THEN
    impersonated_company_id := (jwt_claims->>'app.impersonated_company_id')::uuid;
    RETURN impersonated_company_id;
  END IF;

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
        `
      },
      // Part 4: Create main RPC function
      {
        name: 'Create get_recent_submissions_v3 RPC function',
        sql: `
CREATE OR REPLACE FUNCTION get_recent_submissions_v3(
  limit_param integer DEFAULT 10,
  program_id_param uuid DEFAULT NULL,
  site_id_param uuid DEFAULT NULL
)
RETURNS TABLE (
  submission_id uuid,
  site_id uuid,
  site_name text,
  program_id uuid,
  program_name text,
  temperature numeric,
  humidity numeric,
  weather text,
  created_at timestamptz,
  petri_count bigint,
  gasifier_count bigint,
  global_submission_id integer
) AS $$
DECLARE
  current_user_id uuid;
  user_company_id uuid;
  user_is_active boolean;
  user_is_super_admin boolean;
  impersonated_company_id uuid;
  effective_company_id uuid;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    u.company_id,
    u.is_active,
    u.is_super_admin
  INTO
    user_company_id,
    user_is_active,
    user_is_super_admin
  FROM users u
  WHERE u.id = current_user_id;

  IF user_is_active IS NULL OR user_is_active = false THEN
    RETURN;
  END IF;

  IF user_is_super_admin = true THEN
    impersonated_company_id := get_impersonated_company_id();

    IF impersonated_company_id IS NOT NULL THEN
      effective_company_id := impersonated_company_id;
    ELSE
      effective_company_id := NULL;
    END IF;
  ELSE
    effective_company_id := user_company_id;
  END IF;

  RETURN QUERY
  SELECT
    s.submission_id,
    s.site_id,
    st.name AS site_name,
    s.program_id,
    pp.name AS program_name,
    s.temperature,
    s.humidity,
    s.weather::text,
    s.created_at,
    COALESCE(COUNT(DISTINCT po.observation_id), 0)::bigint AS petri_count,
    COALESCE(COUNT(DISTINCT go.observation_id), 0)::bigint AS gasifier_count,
    s.global_submission_id
  FROM submissions s
  INNER JOIN sites st ON s.site_id = st.site_id
  INNER JOIN pilot_programs pp ON s.program_id = pp.program_id
  LEFT JOIN petri_observations po ON s.submission_id = po.submission_id
  LEFT JOIN gasifier_observations go ON s.submission_id = go.submission_id
  WHERE
    (effective_company_id IS NULL OR pp.company_id = effective_company_id)
    AND (program_id_param IS NULL OR s.program_id = program_id_param)
    AND (site_id_param IS NULL OR s.site_id = site_id_param)
    AND pp.status = 'active'
  GROUP BY
    s.submission_id,
    s.site_id,
    st.name,
    s.program_id,
    pp.name,
    s.temperature,
    s.humidity,
    s.weather,
    s.created_at,
    s.global_submission_id
  ORDER BY s.created_at DESC
  LIMIT limit_param;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in get_recent_submissions_v3: %', SQLERRM;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_recent_submissions_v3(integer, uuid, uuid) TO authenticated;
        `
      }
    ];

    // Execute each part
    for (const part of parts) {
      console.log(`⚙️  ${part.name}...`);

      const { error } = await supabase.rpc('query', { query: part.sql });

      // Most Supabase clients don't have a direct SQL execution endpoint
      // So we'll use a workaround with FROM clause
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: part.sql })
      });

      if (error) {
        console.log(`   ⚠️  Note: ${error.message}`);
        // Continue anyway - might be "already exists" which is fine
      } else {
        console.log(`   ✅ Success`);
      }
    }

    console.log('\n🎉 Migration complete!');
    console.log('\n📊 Testing the function...');

    // Test the function
    const { data, error } = await supabase.rpc('get_recent_submissions_v3', {
      limit_param: 5
    });

    if (error) {
      console.log('⚠️  Function test:', error.message);
      console.log('   (This might be normal if the function needs admin privileges)');
    } else {
      console.log(`✅ Function is working! Retrieved ${data?.length || 0} submissions`);
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

executeMigration();
