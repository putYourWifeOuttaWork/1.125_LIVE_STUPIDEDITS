#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Device Images Migration Validation Report\n');
console.log('='.repeat(80));
console.log('\n');

async function validateMigration() {
  try {
    // 1. Check total device_images count
    console.log('📊 STEP 1: Basic Statistics\n');

    const { count: totalImages, error: countError } = await supabase
      .from('device_images')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;
    console.log(`  Total device_images rows: ${totalImages}`);

    // 2. Check how many have metadata populated
    const { count: withMetadata } = await supabase
      .from('device_images')
      .select('*', { count: 'exact', head: true })
      .not('metadata', 'is', null);

    console.log(`  Rows with metadata: ${withMetadata} (${((withMetadata / totalImages) * 100).toFixed(2)}%)`);

    // 3. Check how many have environmental data in computed columns
    const { count: withTemp } = await supabase
      .from('device_images')
      .select('*', { count: 'exact', head: true })
      .not('temperature', 'is', null);

    console.log(`  Rows with temperature: ${withTemp} (${((withTemp / totalImages) * 100).toFixed(2)}%)`);

    const { count: withHumidity } = await supabase
      .from('device_images')
      .select('*', { count: 'exact', head: true })
      .not('humidity', 'is', null);

    console.log(`  Rows with humidity: ${withHumidity} (${((withHumidity / totalImages) * 100).toFixed(2)}%)`);

    // 4. Check status distribution
    console.log('\n📊 STEP 2: Status Distribution\n');

    const { data: statusDist, error: statusError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT status, COUNT(*) as count
          FROM device_images
          GROUP BY status
          ORDER BY count DESC;
        `
      });

    if (!statusError && statusDist) {
      statusDist.forEach(row => {
        console.log(`  ${row.status}: ${row.count}`);
      });
    } else {
      // Fallback query if RPC not available
      const { data: allImages } = await supabase
        .from('device_images')
        .select('status');

      const statusMap = new Map();
      allImages?.forEach(img => {
        statusMap.set(img.status, (statusMap.get(img.status) || 0) + 1);
      });

      Array.from(statusMap.entries()).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
    }

    // 5. Sample environmental data
    console.log('\n📊 STEP 3: Sample Environmental Data\n');

    const { data: sampleData, error: sampleError } = await supabase
      .from('device_images')
      .select('image_id, device_id, captured_at, temperature, humidity, pressure, gas_resistance, status')
      .eq('status', 'complete')
      .not('temperature', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(5);

    if (sampleError) throw sampleError;

    if (sampleData && sampleData.length > 0) {
      console.log('  Recent complete images with environmental data:');
      sampleData.forEach((row, idx) => {
        console.log(`    ${idx + 1}. Captured: ${new Date(row.captured_at).toISOString()}`);
        console.log(`       Temp: ${row.temperature}°C, Humidity: ${row.humidity}%, Pressure: ${row.pressure}hPa`);
      });
    } else {
      console.log('  ⚠️  No complete images with environmental data found');
    }

    // 6. Check for gaps in environmental data by session
    console.log('\n📊 STEP 4: Data Quality by Session\n');

    const { data: sessionQuality, error: sessionError } = await supabase
      .from('device_images')
      .select('site_device_session_id, status, temperature')
      .not('site_device_session_id', 'is', null)
      .limit(1000);

    if (!sessionError && sessionQuality) {
      const sessionMap = new Map();

      sessionQuality.forEach(img => {
        const sessionId = img.site_device_session_id;
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, {
            total: 0,
            complete: 0,
            withEnvData: 0
          });
        }

        const stats = sessionMap.get(sessionId);
        stats.total++;
        if (img.status === 'complete') stats.complete++;
        if (img.temperature !== null) stats.withEnvData++;
      });

      console.log(`  Analyzed ${sessionMap.size} unique sessions:`);
      let perfectSessions = 0;
      let sessionsNeedingLOCF = 0;

      sessionMap.forEach((stats, sessionId) => {
        if (stats.total === stats.withEnvData) {
          perfectSessions++;
        } else if (stats.withEnvData > 0 && stats.withEnvData < stats.total) {
          sessionsNeedingLOCF++;
        }
      });

      console.log(`    ✅ Sessions with 100% environmental data: ${perfectSessions}`);
      console.log(`    ⚠️  Sessions needing LOCF: ${sessionsNeedingLOCF}`);
      console.log(`    ❌ Sessions with 0% environmental data: ${sessionMap.size - perfectSessions - sessionsNeedingLOCF}`);
    }

    // 7. Test LOCF helper function (if available)
    console.log('\n📊 STEP 5: Testing LOCF Helper Function\n');

    const { data: recentImage } = await supabase
      .from('device_images')
      .select('device_id, site_device_session_id, captured_at')
      .not('site_device_session_id', 'is', null)
      .order('captured_at', { ascending: false })
      .limit(1)
      .single();

    if (recentImage) {
      try {
        const { data: locfResult, error: locfError } = await supabase
          .rpc('get_device_environmental_with_locf', {
            p_device_id: recentImage.device_id,
            p_session_id: recentImage.site_device_session_id,
            p_captured_at: recentImage.captured_at
          });

        if (!locfError && locfResult) {
          console.log('  ✅ LOCF function is working!');
          console.log(`     Temperature: ${locfResult.temperature}°C`);
          console.log(`     LOCF Applied: ${locfResult.locf_applied}`);
          if (locfResult.locf_applied) {
            console.log(`     Source: ${locfResult.source_captured_at}`);
          }
        } else {
          console.log('  ⚠️  LOCF function not available or returned error');
          console.log(`     Apply: 20260104_locf_environmental_helper.sql`);
        }
      } catch (err) {
        console.log('  ⚠️  LOCF function not yet deployed');
      }
    }

    // 8. Overall assessment
    console.log('\n📊 STEP 6: Migration Readiness Assessment\n');

    const dataQualityScore = (withTemp / totalImages) * 100;
    let assessment = '';
    let status = '';

    if (dataQualityScore >= 95) {
      status = '✅ EXCELLENT';
      assessment = 'device_images is ready as single source of truth';
    } else if (dataQualityScore >= 80) {
      status = '⚠️  GOOD';
      assessment = 'Mostly ready, some LOCF will be required';
    } else if (dataQualityScore >= 50) {
      status = '⚠️  FAIR';
      assessment = 'Significant LOCF needed, consider data backfill';
    } else {
      status = '❌ POOR';
      assessment = 'Data quality issues detected, investigate before migration';
    }

    console.log(`  Status: ${status}`);
    console.log(`  Data Quality Score: ${dataQualityScore.toFixed(2)}%`);
    console.log(`  Assessment: ${assessment}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Validation complete!\n');

    // Summary of required actions
    console.log('📋 NEXT STEPS:\n');
    console.log('  1. Apply database migrations:');
    console.log('     - 20260104_device_images_computed_columns.sql');
    console.log('     - 20260104_locf_environmental_helper.sql');
    console.log('     - 20260104_session_wake_snapshots_device_images.sql');
    console.log('     - 20260104_device_telemetry_compat_view.sql (optional)');
    console.log('');
    console.log('  2. Deploy frontend changes (already done):');
    console.log('     - DeviceEnvironmentalPanel.tsx updated');
    console.log('     - SessionDetailsPanel.tsx updated');
    console.log('');
    console.log('  3. Test in staging environment');
    console.log('');
    console.log('  4. Monitor query performance and adjust indexes if needed');
    console.log('');
    console.log('  5. Schedule device_telemetry table deprecation (60 days)');
    console.log('');

  } catch (error) {
    console.error('\n❌ Validation error:', error.message);
    console.error(error);
  }
}

validateMigration();
