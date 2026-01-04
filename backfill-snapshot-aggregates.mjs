#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = `postgresql://postgres.jycxolmevsvrxmeinxff:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

async function backfillSnapshotAggregates() {
  console.log('=== BACKFILL SNAPSHOT AGGREGATES ===\n');

  const client = new pg.Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Get all snapshots that need aggregate data
    const snapshotsQuery = `
      SELECT
        snapshot_id,
        site_id,
        wake_round_start,
        wake_round_end,
        avg_temperature,
        avg_humidity,
        avg_mgi,
        max_mgi
      FROM session_wake_snapshots
      WHERE avg_temperature IS NULL
         OR avg_humidity IS NULL
         OR avg_mgi IS NULL
         OR max_mgi IS NULL
      ORDER BY wake_round_start ASC;
    `;

    const snapshotsResult = await client.query(snapshotsQuery);
    const snapshots = snapshotsResult.rows;

    console.log(`Found ${snapshots.length} snapshots to backfill\n`);

    if (snapshots.length === 0) {
      console.log('✅ All snapshots already have aggregate data!');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const snapshot of snapshots) {
      try {
        // Calculate aggregate metrics for this snapshot's time window using SQL
        const aggregatesQuery = `
          WITH telemetry_agg AS (
            SELECT
              AVG(dt.temperature)::numeric(5,2) as avg_temp,
              AVG(dt.humidity)::numeric(5,2) as avg_humid
            FROM device_telemetry dt
            INNER JOIN devices d ON dt.device_id = d.device_id
            WHERE d.site_id = $1
              AND d.is_active = true
              AND dt.captured_at BETWEEN $2 AND $3
              AND (dt.temperature IS NOT NULL OR dt.humidity IS NOT NULL)
          ),
          mgi_agg AS (
            SELECT
              AVG(di.mgi_score)::numeric(5,2) as avg_mgi,
              MAX(di.mgi_score)::numeric(5,2) as max_mgi
            FROM device_images di
            INNER JOIN devices d ON di.device_id = d.device_id
            WHERE d.site_id = $1
              AND d.is_active = true
              AND di.captured_at BETWEEN $2 AND $3
              AND di.mgi_score IS NOT NULL
          )
          SELECT
            t.avg_temp,
            t.avg_humid,
            m.avg_mgi,
            m.max_mgi
          FROM telemetry_agg t
          CROSS JOIN mgi_agg m;
        `;

        const aggregatesResult = await client.query(aggregatesQuery, [
          snapshot.site_id,
          snapshot.wake_round_start,
          snapshot.wake_round_end
        ]);

        const aggregates = aggregatesResult.rows[0] || {};

        // Update the snapshot with calculated aggregates
        const updateQuery = `
          UPDATE session_wake_snapshots
          SET
            avg_temperature = $1,
            avg_humidity = $2,
            avg_mgi = $3,
            max_mgi = $4
          WHERE snapshot_id = $5;
        `;

        await client.query(updateQuery, [
          aggregates.avg_temp || null,
          aggregates.avg_humid || null,
          aggregates.avg_mgi || null,
          aggregates.max_mgi || null,
          snapshot.snapshot_id
        ]);

        successCount++;

        if (successCount % 10 === 0) {
          console.log(`  Processed ${successCount}/${snapshots.length} snapshots...`);
        }

      } catch (err) {
        console.error(`Error processing snapshot ${snapshot.snapshot_id}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n=== BACKFILL COMPLETE ===');
    console.log(`✅ Successfully updated: ${successCount} snapshots`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} snapshots`);
    }

  } catch (error) {
    console.error('❌ Error during backfill:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

backfillSnapshotAggregates();
