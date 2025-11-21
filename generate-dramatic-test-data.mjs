import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🎬 Generating dramatic test data for Timeline Playback visualization...\n');

// Get IoT Test Site 2 (site_code is numeric)
const { data: site } = await supabase
  .from('sites')
  .select('site_id, name, site_code')
  .eq('name', 'Iot Test Site 2')
  .single();

if (!site) {
  console.error('❌ IoT Test Site 2 not found!');
  process.exit(1);
}

console.log(`✅ Found site: ${site.name} (${site.site_code})\n`);

// Get devices for this site (with company_id and program_id)
const { data: devices } = await supabase
  .from('devices')
  .select('device_id, device_code, device_name, company_id, program_id')
  .eq('site_id', site.site_id)
  .eq('is_active', true)
  .order('device_code');

console.log(`📱 Found ${devices.length} active devices:\n`);
devices.forEach(d => console.log(`   • ${d.device_code} (${d.device_name})`));

// Get or create a session for this site
const baseDate = new Date('2025-11-19T00:00:00Z');
const sessionDate = baseDate.toISOString().split('T')[0];

console.log('\n📅 Creating session for testing...');

const { data: existingSession } = await supabase
  .from('site_device_sessions')
  .select('session_id')
  .eq('site_id', site.site_id)
  .eq('session_date', sessionDate)
  .single();

let sessionId;

if (existingSession) {
  sessionId = existingSession.session_id;
  console.log(`✅ Found existing session: ${sessionId}\n`);
} else {
  // Create new session
  const { data: newSession, error: sessionError } = await supabase
    .from('site_device_sessions')
    .insert({
      site_id: site.site_id,
      program_id: devices[0].program_id,
      company_id: devices[0].company_id,
      session_date: sessionDate,
      session_start: baseDate.toISOString(),
      session_end: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'active'
    })
    .select('session_id')
    .single();

  if (sessionError) {
    console.error('❌ Error creating session:', sessionError.message);
    process.exit(1);
  }

  sessionId = newSession.session_id;
  console.log(`✅ Created new session: ${sessionId}\n`);
}

// Create dramatic scenario: 24 hours with 8 wake rounds (3-hour windows)
// Each device will have different "story arcs"
const wakeRounds = 8; // 8 x 3 hours = 24 hours

console.log('🎨 Creating dramatic data scenarios:\n');

// Default scenario for all devices (we'll create 5 different arcs)
const scenarioTemplates = [
  {
    name: 'Critical Growth',
    temp: [22, 28, 45, 68, 78, 86, 91, 88],      // Cold → HOT!
    humidity: [45, 52, 58, 65, 72, 78, 82, 80],  // Rising humidity
    mgi: [0.15, 0.22, 0.35, 0.48, 0.58, 0.68, 0.75, 0.72], // Rapid MGI growth
    battery: [4.1, 4.0, 3.9, 3.85, 3.8, 3.75, 3.7, 3.65]
  },
  {
    name: 'Stable & Cool',
    temp: [38, 40, 42, 40, 39, 38, 37, 38],      // Stays cool
    humidity: [42, 44, 45, 44, 43, 42, 43, 44],  // Stable humidity
    mgi: [0.18, 0.19, 0.22, 0.24, 0.26, 0.27, 0.28, 0.29], // Slow growth
    battery: [3.9, 3.88, 3.86, 3.84, 3.82, 3.8, 3.78, 3.76]
  },
  {
    name: 'Moderate Warning',
    temp: [35, 48, 55, 62, 68, 65, 58, 52],      // Spike then cool
    humidity: [50, 58, 64, 68, 65, 60, 55, 52],  // Spike then normalize
    mgi: [0.20, 0.28, 0.38, 0.45, 0.42, 0.38, 0.35, 0.33], // Peak then drop
    battery: [3.95, 3.9, 3.85, 3.8, 3.78, 3.76, 3.75, 3.74]
  },
  {
    name: 'Early Alert',
    temp: [25, 32, 48, 72, 85, 89, 87, 82],      // Fast heating
    humidity: [38, 45, 55, 68, 75, 80, 78, 72],  // Rising fast
    mgi: [0.12, 0.25, 0.42, 0.55, 0.62, 0.68, 0.65, 0.60], // High growth
    battery: [4.0, 3.95, 3.88, 3.82, 3.75, 3.7, 3.68, 3.66]
  },
  {
    name: 'Overnight Stable',
    temp: [30, 32, 34, 36, 38, 40, 42, 44],      // Gradual warming
    humidity: [48, 50, 52, 54, 56, 58, 60, 62],  // Gradual increase
    mgi: [0.16, 0.18, 0.21, 0.24, 0.28, 0.32, 0.36, 0.40], // Steady growth
    battery: [3.92, 3.9, 3.88, 3.86, 3.84, 3.82, 3.8, 3.78]
  }
];

// Assign scenarios to actual devices
const scenarios = {};
devices.forEach((device, idx) => {
  scenarios[device.device_code] = scenarioTemplates[idx % scenarioTemplates.length];
});

// Generate wake payloads for each round
let totalPayloads = 0;
let totalImages = 0;

for (let round = 0; round < wakeRounds; round++) {
  const roundStart = new Date(baseDate.getTime() + (round * 3 * 60 * 60 * 1000));
  const roundEnd = new Date(roundStart.getTime() + (3 * 60 * 60 * 1000));
  
  console.log(`\n📸 Round ${round + 1}/${wakeRounds}: ${roundStart.toISOString().slice(11, 16)} - ${roundEnd.toISOString().slice(11, 16)}`);
  
  for (const device of devices) {
    const scenario = scenarios[device.device_code];
    if (!scenario) continue;
    
    // Each device wakes 1-3 times per 3-hour window
    const wakesInRound = Math.floor(Math.random() * 2) + 1;
    
    for (let wake = 0; wake < wakesInRound; wake++) {
      // Random time within the 3-hour window
      const wakeOffset = Math.random() * 3 * 60 * 60 * 1000;
      const wakeTime = new Date(roundStart.getTime() + wakeOffset);
      
      // Get values for this round (with slight variation per wake)
      const temp = scenario.temp[round] + (Math.random() * 4 - 2);
      const humidity = scenario.humidity[round] + (Math.random() * 3 - 1.5);
      const mgi = scenario.mgi[round] + (Math.random() * 0.03 - 0.015);
      const battery = scenario.battery[round] + (Math.random() * 0.05 - 0.025);
      
      // Create device image first
      const imageName = `${device.device_code}-r${round}-w${wake}-${Date.now()}.jpg`;
      const { data: image, error: imageError } = await supabase
        .from('device_images')
        .insert({
          device_id: device.device_id,
          site_id: site.site_id,
          image_name: imageName,
          image_url: `https://placeholder.com/device-${device.device_code}-${round}-${wake}.jpg`,
          mgi_score: Math.max(0, Math.min(1, mgi)),
          observation_type: 'petri',
          captured_at: wakeTime.toISOString(),
          metadata: { scenario: scenario.name, round, wake }
        })
        .select('image_id')
        .single();
      
      if (imageError) {
        console.error(`   ❌ Error creating image for ${device.device_code}:`, imageError.message);
        continue;
      }
      
      // Create wake payload
      const { error: payloadError } = await supabase
        .from('device_wake_payloads')
        .insert({
          device_id: device.device_id,
          site_id: site.site_id,
          company_id: device.company_id,
          program_id: device.program_id,
          site_device_session_id: sessionId,
          temperature: temp,
          humidity: humidity,
          pressure: 1013 + (Math.random() * 10 - 5),
          battery_voltage: battery,
          wifi_rssi: -65 + Math.floor(Math.random() * 20),
          image_id: image.image_id,
          captured_at: wakeTime.toISOString()
        });
      
      if (payloadError) {
        console.error(`   ❌ Error creating payload for ${device.device_code}:`, payloadError.message);
        continue;
      }
      
      totalPayloads++;
      totalImages++;
    }
  }
  
  console.log(`   ✓ Created payloads for round ${round + 1}`);
}

console.log('\n✅ Dramatic test data generated!\n');
console.log('📊 Summary:');
console.log(`   • Total wake payloads: ${totalPayloads}`);
console.log(`   • Total images: ${totalImages}`);
console.log(`   • Wake rounds: ${wakeRounds} (3-hour windows)`);
console.log(`   • Time span: 24 hours`);
console.log('\n🎨 Scenarios created:');
Object.entries(scenarios).forEach(([code, scenario]) => {
  console.log(`   • ${code}: ${scenario.name}`);
  console.log(`     - Temp: ${scenario.temp[0]}°F → ${scenario.temp[7]}°F`);
  console.log(`     - MGI: ${scenario.mgi[0]} → ${scenario.mgi[7]}`);
});

console.log('\n📌 Next: Regenerate snapshots to see the dramatic changes!\n');
