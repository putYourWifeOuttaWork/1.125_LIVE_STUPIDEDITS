import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

console.log('\n=== ROBOFLOW TRIGGER DEBUG ===\n');

// 1. Check async_error_logs
console.log('1. Checking async_error_logs...');
const { data: errors, error: errorCheckError } = await supabase
  .from('async_error_logs')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(5);

if (errorCheckError) {
  console.log('Table may not exist:', errorCheckError.message);
} else if (!errors || errors.length === 0) {
  console.log('No errors found (or table empty)');
} else {
  console.log('Found errors:', errors);
}

// 2. Check test record
console.log('\n2. Checking test record...');
const { data: record } = await supabase
  .from('device_images')
  .select('image_id, status, image_url, mgi_scoring_status, mgi_score')
  .eq('image_id', 'fa590cdd-5054-4ad5-910e-c928f9c70b07')
  .single();

console.log('Record:', {
  status: record?.status,
  has_url: record?.image_url ? 'YES' : 'NO',
  mgi_scoring_status: record?.mgi_scoring_status
});

// 3. Test edge function directly
console.log('\n3. Testing edge function...');
const response = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/score_mgi_image`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
  },
  body: JSON.stringify({
    image_id: 'fa590cdd-5054-4ad5-910e-c928f9c70b07',
    image_url: 'https://immunolytics.com/wp-content/uploads/2019/10/Image-petri-dish.jpg'
  })
});

console.log('Response status:', response.status);
const result = await response.text();
console.log('Response:', result.substring(0, 200));

console.log('\n=== DONE ===\n');
