#!/bin/bash
# Complete IoT Device Test Suite Runner
# Runs all test scenarios in sequence and validates results

set -e  # Exit on any error

echo "======================================================================"
echo "🧪 IoT Device Complete Test Suite"
echo "======================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "🔍 Checking prerequisites..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Python 3 found${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js found${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ .env file found${NC}"

# Check MQTT service
echo ""
echo "🔍 Checking MQTT service..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MQTT service is running${NC}"
else
    echo -e "${YELLOW}⚠️  MQTT service not responding${NC}"
    echo "   Please start it with: cd mqtt-service && npm start"
    read -p "   Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if Python simulator exists
if [ ! -f mqtt-test-device-simulator.py ]; then
    echo -e "${RED}❌ mqtt-test-device-simulator.py not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Device simulator found${NC}"

echo ""
echo "======================================================================"
echo "📦 Step 1: Seed Test Devices"
echo "======================================================================"
echo ""

node test-seed-devices.mjs
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test devices seeded successfully${NC}"
else
    echo -e "${RED}❌ Failed to seed test devices${NC}"
    exit 1
fi

echo ""
echo "⏸️  Waiting 3 seconds..."
sleep 3

echo ""
echo "======================================================================"
echo "🧪 Step 2: Run Test Scenarios"
echo "======================================================================"
echo ""

node test-device-scenarios.mjs
TESTS_RESULT=$?

echo ""
echo "⏸️  Waiting 5 seconds for database writes to complete..."
sleep 5

echo ""
echo "======================================================================"
echo "🔍 Step 3: Validate Test Results"
echo "======================================================================"
echo ""

node validate-test-results.mjs --detailed
VALIDATION_RESULT=$?

echo ""
echo "======================================================================"
echo "📊 Final Summary"
echo "======================================================================"
echo ""

if [ $TESTS_RESULT -eq 0 ] && [ $VALIDATION_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo ""
    echo "🎉 Your IoT device system is working correctly!"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. View devices in UI: http://localhost:5173/devices"
    echo "   2. Click on a test device to see sessions and telemetry"
    echo "   3. Check device history for event timeline"
    echo "   4. Verify submissions were created (if devices are mapped)"
    echo ""
    echo "🧹 Clean up test data when done:"
    echo "   node test-cleanup-devices.mjs"
    echo ""
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "⚠️  Review the output above for details."
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   1. Check MQTT service logs for errors"
    echo "   2. Verify Supabase edge function is deployed"
    echo "   3. Check database schema is up to date"
    echo "   4. Review IOT_DEVICE_TESTING_GUIDE.md"
    echo ""
    exit 1
fi
