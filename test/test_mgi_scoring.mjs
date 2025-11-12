/**
 * Test MGI Scoring via Roboflow
 *
 * Tests the score_mgi_image edge function with a real image URL
 *
 * Usage:
 *   node test/test_mgi_scoring.mjs [image_id] [image_url]
 */

import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testMGIScoring(imageId, imageUrl) {
  console.log('\n🧪 Testing MGI Scoring via Roboflow');
  console.log('===================================');
  console.log(`Image ID: ${imageId}`);
  console.log(`Image URL: ${imageUrl}`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing environment variables:');
    console.error('   - VITE_SUPABASE_URL or SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  try {
    const functionUrl = `${SUPABASE_URL}/functions/v1/score_mgi_image`;

    console.log(`\n📤 Calling edge function: ${functionUrl}`);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        image_id: imageId,
        image_url: imageUrl,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ Edge function error:', response.status, response.statusText);
      console.error('Response:', JSON.stringify(result, null, 2));
      process.exit(1);
    }

    console.log('\n✅ Edge function response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n🎉 MGI scoring successful!');
      console.log(`   - Observation ID: ${result.observation_id}`);
      console.log(`   - MGI Score: ${result.mgi_score} (0.0-1.0)`);
      console.log(`   - Confidence: ${result.confidence || 'N/A'}`);

      console.log('\n🔍 Verification steps:');
      console.log(`1. Check database:`);
      console.log(`   SELECT * FROM petri_observations WHERE observation_id = '${result.observation_id}';`);
      console.log(`2. Verify mgi_score, mgi_confidence, mgi_scored_at are populated`);
      console.log(`3. Calculate velocity:`);
      console.log(`   SELECT * FROM fn_calculate_mgi_velocity((SELECT device_id FROM submissions WHERE submission_id = (SELECT submission_id FROM petri_observations WHERE observation_id = '${result.observation_id}')));`);
    } else {
      console.warn('\n⚠️  MGI scoring returned false success:', result.message);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('❌ Usage: node test/test_mgi_scoring.mjs [image_id] [image_url]');
  console.error('\nExample:');
  console.error('  node test/test_mgi_scoring.mjs \\');
  console.error('    "123e4567-e89b-12d3-a456-426614174000" \\');
  console.error('    "https://your-bucket.supabase.co/storage/v1/object/public/device-images/image.jpg"');
  process.exit(1);
}

const imageId = args[0];
const imageUrl = args[1];

testMGIScoring(imageId, imageUrl)
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
