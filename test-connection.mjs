import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jycxolmevsvrxmeinxff.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y3hvbG1ldnN2cnhtZWlueGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzE0MzYsImV4cCI6MjA2NjcwNzQzNn0.0msVw5lkmycrU1p1qFiUTv7Q6AB-IIdpZejYbekW4sk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testProductionData() {
  console.log('🔗 Testing connection to production Supabase...\n');
  
  const { data: programs, count: programCount } = await supabase
    .from('pilot_programs')
    .select('id, name', { count: 'exact' })
    .limit(3);
  
  console.log('✅ Pilot Programs:', programCount || 0, 'total');
  if (programs && programs.length > 0) {
    programs.forEach(p => console.log(`   - ${p.name}`));
  }
  
  const { data: sites, count: sitesCount } = await supabase
    .from('sites')
    .select('id, name', { count: 'exact' })
    .limit(3);
  
  console.log('\n✅ Sites:', sitesCount || 0, 'total');
  if (sites && sites.length > 0) {
    sites.forEach(s => console.log(`   - ${s.name}`));
  }
  
  const { data: submissions, count: submissionsCount } = await supabase
    .from('submissions')
    .select('id', { count: 'exact' })
    .limit(1);
  
  console.log('\n✅ Submissions:', submissionsCount || 0, 'total');
  
  const { data: observations, count: observationsCount } = await supabase
    .from('observations')
    .select('id', { count: 'exact' })
    .limit(1);
  
  console.log('✅ Observations:', observationsCount || 0, 'total');
  
  const { data: buckets } = await supabase.storage.listBuckets();
  
  console.log('\n✅ Storage Buckets:');
  if (buckets) {
    buckets.forEach(bucket => console.log(`   - ${bucket.name}`));
  }
  
  console.log('\n🎉 Successfully connected to your production Supabase!');
}

testProductionData().catch(console.error);
