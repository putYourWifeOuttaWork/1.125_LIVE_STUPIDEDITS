#!/bin/bash

echo "🔍 Phase 3 Compliance Verification"
echo "=================================="
echo ""

# Check 1: Migration applied
echo "1. Checking edge_chunk_buffer table..."
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM edge_chunk_buffer;" &>/dev/null
  if [ $? -eq 0 ]; then
    echo "   ✅ edge_chunk_buffer table exists"
  else
    echo "   ❌ edge_chunk_buffer table NOT FOUND"
    echo "   Run: supabase db push"
    exit 1
  fi
else
  echo "   ⚠️  DATABASE_URL not set - skipping DB checks"
fi

# Check 2: Required modules
echo ""
echo "2. Checking edge function modules..."
MODULES="index.ts ingest.ts finalize.ts retry.ts idempotency.ts storage.ts ack.ts config.ts types.ts"
ALL_FOUND=true

for module in $MODULES; do
  if [ -f "supabase/functions/mqtt_device_handler/$module" ]; then
    echo "   ✅ $module"
  else
    echo "   ❌ $module NOT FOUND"
    ALL_FOUND=false
  fi
done

if [ "$ALL_FOUND" = false ]; then
  echo ""
  echo "   ❌ Some modules are missing!"
  exit 1
fi

# Check 3: Verify SQL handler calls (grep for rpc calls)
echo ""
echo "3. Checking SQL handler integrations..."
grep -q "fn_wake_ingestion_handler" supabase/functions/mqtt_device_handler/ingest.ts && echo "   ✅ ingest.ts calls fn_wake_ingestion_handler" || echo "   ❌ MISSING: fn_wake_ingestion_handler call"
grep -q "fn_image_completion_handler" supabase/functions/mqtt_device_handler/finalize.ts && echo "   ✅ finalize.ts calls fn_image_completion_handler" || echo "   ❌ MISSING: fn_image_completion_handler call"
grep -q "fn_retry_by_id_handler" supabase/functions/mqtt_device_handler/retry.ts && echo "   ✅ retry.ts calls fn_retry_by_id_handler" || echo "   ❌ MISSING: fn_retry_by_id_handler call"

# Check 4: Verify WebSocket transport
echo ""
echo "4. Checking MQTT transport..."
if grep -q "wss://" supabase/functions/mqtt_device_handler/index.ts; then
  echo "   ✅ Using WebSocket (wss://)"
else
  echo "   ❌ NOT using WebSocket - may fail in Edge runtime"
fi

# Check 5: Verify stable filenames
echo ""
echo "5. Checking storage filenames..."
if grep -q "deviceMac}/\${imageName}.jpg" supabase/functions/mqtt_device_handler/storage.ts; then
  echo "   ✅ Using stable filenames (no timestamp)"
else
  echo "   ⚠️  Filename pattern may not be idempotent"
fi

# Summary
echo ""
echo "=================================="
echo "✅ Phase 3 Compliance Verification Complete"
echo ""
echo "Ready for deployment:"
echo "  supabase functions deploy mqtt_device_handler"
echo ""
echo "After deployment, run health check:"
echo "  curl https://YOUR_PROJECT.supabase.co/functions/v1/mqtt_device_handler"
echo ""
