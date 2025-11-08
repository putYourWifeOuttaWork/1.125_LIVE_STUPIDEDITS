#!/bin/bash

# MQTT Protocol Testing - Quick Start Script
# Runs the complete test suite and validates results

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║        ESP32-CAM MQTT Protocol Testing Suite                      ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
DEVICE_MAC="${1:-TEST-ESP32-001}"
TEST_MODE="${2:-all}"

echo "Configuration:"
echo "  Device MAC: $DEVICE_MAC"
echo "  Test Mode: $TEST_MODE"
echo ""

# Check prerequisites
echo "Checking prerequisites..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3."
    exit 1
fi
echo "✅ Python 3 found"

# Check paho-mqtt
if ! python3 -c "import paho.mqtt.client" 2>/dev/null; then
    echo "⚠️  paho-mqtt not installed. Installing..."
    pip3 install paho-mqtt
fi
echo "✅ paho-mqtt installed"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js."
    exit 1
fi
echo "✅ Node.js found"

# Check MQTT service
echo ""
echo "Checking MQTT service..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ MQTT service is running"
    echo ""
    echo "Service status:"
    curl -s http://localhost:3000/health | python3 -m json.tool
else
    echo "⚠️  MQTT service not responding on localhost:3000"
    echo ""
    echo "To start the MQTT service:"
    echo "  cd mqtt-service"
    echo "  npm install"
    echo "  npm start"
    echo ""
    read -p "Start MQTT service now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd mqtt-service
        npm install > /dev/null 2>&1
        npm start &
        MQTT_PID=$!
        echo "MQTT service started with PID $MQTT_PID"
        sleep 5
        cd ..
    else
        echo "Skipping MQTT service startup. Tests may fail."
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "Starting Protocol Tests"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Run the Python simulator
python3 mqtt-test-device-simulator.py --mac "$DEVICE_MAC" --test "$TEST_MODE"

TEST_EXIT_CODE=$?

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "Validating Results"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Wait a moment for database writes to complete
sleep 2

# Run validation
node validate-mqtt-protocol.mjs --mac="$DEVICE_MAC" --since=10

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "Testing Complete"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Review the validation output above"
    echo "  2. Check Supabase dashboard for data"
    echo "  3. Run additional tests with different scenarios"
    echo "  4. Test with real ESP32-CAM hardware"
else
    echo "❌ Some tests failed. Review the output above."
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check MQTT service logs"
    echo "  2. Verify database connection"
    echo "  3. Review Supabase dashboard for errors"
    echo "  4. See MQTT_PROTOCOL_TESTING_GUIDE.md for details"
fi

echo ""
echo "For more information, see: MQTT_PROTOCOL_TESTING_GUIDE.md"
echo ""

exit $TEST_EXIT_CODE
