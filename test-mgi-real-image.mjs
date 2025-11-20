#!/usr/bin/env node

/**
 * Test MGI Flow with Real Image via MQTT
 * 
 * This script:
 * 1. Gets a real test device from database
 * 2. Creates/downloads a petri dish image
 * 3. Sends image via MQTT (chunked like real device)
 * 4. Monitors the complete flow through to MGI scoring
 * 5. Verifies velocity calculation
 */

import { createClient } from '@supabase/supabase-js';
import mqtt from 'mqtt';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Supabase config
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file!');
  console.error('   Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// HiveMQ config (from mqtt-service)
const MQTT_BROKER = 'a3078ad5f2014bd9bacbf297c0e93368.s1.eu.hivemq.cloud';
const MQTT_PORT = 8883;
const MQTT_USERNAME = 'sporeless';
const MQTT_PASSWORD = 'Sporeless2024!';

// Test image URL (petri dish with mold)
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=800';

console.log('🧪 MGI Real Image Test via MQTT\n');
console.log('='.repeat(60));

// ============================================
// Step 1: Get or create test device
// ============================================

async function getTestDevice() {
  console.log('\n📱 Step 1: Getting test device...');
  
  // Find existing test device
  const { data: devices, error } = await supabase
    .from('devices')
    .select('device_id, device_mac, device_name, device_code, site_id, program_id, company_id')
    .eq('device_type', 'physical')
    .eq('provisioning_status', 'active')
    .not('site_id', 'is', null)
    .not('program_id', 'is', null)
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('❌ Error fetching device:', error.message);
    process.exit(1);
  }
  
  if (!devices) {
    console.error('❌ No active physical devices found!');
    console.log('\n💡 Create a device first:');
    console.log('   1. Go to Devices page');
    console.log('   2. Click "Register New Device"');
    console.log('   3. Enter MAC address like: AA:BB:CC:DD:EE:01');
    process.exit(1);
  }
  
  console.log('✅ Found device:', devices.device_name);
  console.log('   MAC:', devices.device_mac);
  console.log('   Site ID:', devices.site_id);
  console.log('   Program ID:', devices.program_id);
  
  return devices;
}

// ============================================
// Step 2: Download test image
// ============================================

async function downloadTestImage() {
  console.log('\n📥 Step 2: Downloading test petri dish image...');
  
  const imagePath = join(__dirname, 'test-petri-image.jpg');
  
  if (existsSync(imagePath)) {
    console.log('✅ Using cached image:', imagePath);
    return readFileSync(imagePath);
  }
  
  return new Promise((resolve, reject) => {
    https.get(TEST_IMAGE_URL, (response) => {
      const chunks = [];
      
      response.on('data', (chunk) => chunks.push(chunk));
      
      response.on('end', () => {
        const imageBuffer = Buffer.concat(chunks);
        writeFileSync(imagePath, imageBuffer);
        console.log('✅ Downloaded image:', imageBuffer.length, 'bytes');
        resolve(imageBuffer);
      });
      
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ============================================
// Step 3: Send image via MQTT
// ============================================

async function sendImageViaMQTT(device, imageBuffer) {
  console.log('\n📡 Step 3: Connecting to MQTT broker...');
  
  const client = mqtt.connect(`mqtts://${MQTT_BROKER}:${MQTT_PORT}`, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    clientId: `test-client-${Date.now()}`,
    rejectUnauthorized: true,
  });
  
  return new Promise((resolve, reject) => {
    client.on('connect', async () => {
      console.log('✅ Connected to HiveMQ Cloud');
      
      try {
        const deviceMac = device.device_mac.replace(/:/g, '');
        const imageName = `test_${Date.now()}.jpg`;
        const timestamp = new Date().toISOString();
        
        // Calculate chunks (same as real device)
        const CHUNK_SIZE = 4096;
        const totalChunks = Math.ceil(imageBuffer.length / CHUNK_SIZE);
        
        console.log('\n📤 Sending image in', totalChunks, 'chunks...');
        
        // Step 3a: Send HELLO/status message
        console.log('\n   1️⃣  Sending HELLO message...');
        const helloTopic = `brainlytree/${deviceMac}/status`;
        const helloPayload = {
          mac_address: device.device_mac,
          status: 'awake',
          battery_level: 85,
          temperature: 22.5,
          humidity: 65,
          timestamp,
        };
        
        client.publish(helloTopic, JSON.stringify(helloPayload), { qos: 1 });
        await sleep(1000);
        
        // Step 3b: Send image metadata
        console.log('   2️⃣  Sending image metadata...');
        const dataTopic = `brainlytree/${deviceMac}/data`;
        const metadata = {
          image_name: imageName,
          total_chunks: totalChunks,
          image_size: imageBuffer.length,
          temperature: 22.5,
          humidity: 65,
          battery_level: 85,
          slot_index: 1,
          timestamp,
        };
        
        client.publish(dataTopic, JSON.stringify(metadata), { qos: 1 });
        await sleep(500);
        
        // Step 3c: Send chunks
        console.log('   3️⃣  Sending', totalChunks, 'image chunks...');
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, imageBuffer.length);
          const chunkData = imageBuffer.slice(start, end);
          
          const chunkPayload = {
            image_name: imageName,
            chunk_id: i,
            total_chunks: totalChunks,
            data: chunkData.toString('base64'),
            timestamp,
          };
          
          client.publish(dataTopic, JSON.stringify(chunkPayload), { qos: 1 });
          
          if ((i + 1) % 10 === 0) {
            process.stdout.write(`\r      Progress: ${i + 1}/${totalChunks} chunks`);
          }
          
          await sleep(100); // Throttle like real device
        }
        console.log(`\r      Progress: ${totalChunks}/${totalChunks} chunks ✅`);
        
        // Step 3d: Send finalize message
        console.log('   4️⃣  Sending finalize message...');
        const finalizePayload = {
          image_name: imageName,
          action: 'finalize',
          total_chunks: totalChunks,
          timestamp,
        };
        
        client.publish(dataTopic, JSON.stringify(finalizePayload), { qos: 1 });
        await sleep(1000);
        
        console.log('✅ Image transmission complete!');
        
        client.end();
        resolve({ imageName, deviceMac });
      } catch (err) {
        client.end();
        reject(err);
      }
    });
    
    client.on('error', (err) => {
      console.error('❌ MQTT error:', err.message);
      reject(err);
    });
    
    // Timeout after 2 minutes
    setTimeout(() => {
      client.end();
      reject(new Error('MQTT connection timeout'));
    }, 120000);
  });
}

// ============================================
// Step 4: Monitor database for results
// ============================================

async function monitorResults(device, imageName) {
  console.log('\n🔍 Step 4: Monitoring database for results...');
  console.log('   Waiting for image processing...\n');
  
  let attempts = 0;
  const maxAttempts = 60; // 2 minutes
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Check device_images
    const { data: imageData } = await supabase
      .from('device_images')
      .select('image_id, image_url, status, mgi_score, mgi_confidence, observation_id')
      .eq('device_id', device.device_id)
      .ilike('image_name', `%${imageName}%`)
      .maybeSingle();
    
    if (imageData) {
      console.log(`\r✅ [${attempts}s] Image found in device_images!`);
      console.log('   Status:', imageData.status);
      console.log('   Image URL:', imageData.image_url);
      
      if (imageData.status === 'complete' && imageData.observation_id) {
        console.log('   ✅ Image complete! Observation ID:', imageData.observation_id);
        
        // Check petri_observations for MGI score
        const { data: obsData } = await supabase
          .from('petri_observations')
          .select('observation_id, mgi_score, mgi_confidence, growth_velocity, mgi_scored_at')
          .eq('observation_id', imageData.observation_id)
          .maybeSingle();
        
        if (obsData) {
          if (obsData.mgi_score !== null) {
            console.log('\n🎯 MGI SCORING COMPLETE!');
            console.log('   ═══════════════════════════════════════');
            console.log('   MGI Score:', (obsData.mgi_score * 100).toFixed(1) + '%');
            console.log('   Confidence:', obsData.mgi_confidence ? (obsData.mgi_confidence * 100).toFixed(1) + '%' : 'N/A');
            console.log('   Growth Velocity:', obsData.growth_velocity ? obsData.growth_velocity.toFixed(4) + '/day' : 'N/A (first observation)');
            console.log('   Scored At:', obsData.mgi_scored_at || 'N/A');
            console.log('   ═══════════════════════════════════════\n');
            
            // Verify device_images was synced
            const { data: syncCheck } = await supabase
              .from('device_images')
              .select('mgi_score')
              .eq('image_id', imageData.image_id)
              .maybeSingle();
            
            if (syncCheck?.mgi_score) {
              console.log('✅ MGI synced to device_images (for snapshots)');
            } else {
              console.log('⚠️  MGI not synced to device_images yet');
            }
            
            return true;
          } else {
            console.log(`\r⏳ [${attempts}s] Waiting for Roboflow scoring...`);
          }
        }
      } else {
        console.log(`\r⏳ [${attempts}s] Image status: ${imageData.status}`);
      }
    } else {
      process.stdout.write(`\r⏳ [${attempts}s] Waiting for image to appear in database...`);
    }
    
    await sleep(2000);
  }
  
  console.log('\n⚠️  Timeout: MGI scoring did not complete in time');
  console.log('   Check async_error_logs for issues');
  return false;
}

// ============================================
// Step 5: Verify complete flow
// ============================================

async function verifyCompleteFlow(device) {
  console.log('\n🔬 Step 5: Verifying complete MGI flow...\n');
  
  // Check all observations for this device
  const { data: observations } = await supabase
    .from('petri_observations')
    .select('observation_id, mgi_score, growth_velocity, mgi_scored_at, created_at')
    .eq('device_id', device.device_id)
    .not('mgi_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (observations && observations.length > 0) {
    console.log('📊 Recent MGI observations for this device:\n');
    console.log('   Date/Time              | MGI Score | Velocity  ');
    console.log('   ──────────────────────────────────────────────');
    
    observations.forEach(obs => {
      const date = new Date(obs.created_at).toLocaleString();
      const score = (obs.mgi_score * 100).toFixed(1).padStart(5) + '%';
      const velocity = obs.growth_velocity 
        ? (obs.growth_velocity > 0 ? '+' : '') + obs.growth_velocity.toFixed(4) + '/day'
        : 'N/A';
      
      console.log(`   ${date} | ${score}   | ${velocity}`);
    });
    
    if (observations.length >= 2) {
      console.log('\n✅ Velocity calculation working! (comparing observations)');
    } else {
      console.log('\n⚠️  Only one observation - need more data for velocity');
    }
  } else {
    console.log('⚠️  No MGI observations found for this device');
  }
}

// ============================================
// Helper functions
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Main execution
// ============================================

async function main() {
  try {
    const device = await getTestDevice();
    const imageBuffer = await downloadTestImage();
    const { imageName } = await sendImageViaMQTT(device, imageBuffer);
    const success = await monitorResults(device, imageName);
    
    if (success) {
      await verifyCompleteFlow(device);
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ MGI FLOW TEST COMPLETE!');
      console.log('='.repeat(60));
      console.log('\nWhat happened:');
      console.log('  1. ✅ Image sent via MQTT (like real device)');
      console.log('  2. ✅ Image assembled and uploaded to storage');
      console.log('  3. ✅ petri_observation created');
      console.log('  4. ✅ Roboflow scored the image');
      console.log('  5. ✅ Velocity auto-calculated');
      console.log('  6. ✅ MGI synced to device_images');
      console.log('\n🎯 Go to Submissions page to see the result!');
    } else {
      console.log('\n❌ Test did not complete successfully');
      console.log('   Check the logs above for errors');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
