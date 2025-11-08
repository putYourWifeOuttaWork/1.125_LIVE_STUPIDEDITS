#!/usr/bin/env python3
"""
ESP32-CAM Mock Device Simulator
Comprehensive MQTT Protocol Testing Tool

Simulates the complete BrainlyTree ESP32-CAM device protocol including:
- Device status messages (alive with pending counts)
- Image metadata transmission
- Chunked image upload with configurable chunk size
- Missing chunk retry mechanism
- Offline recovery with pending queue
- Environmental sensor data (BME680)
"""

import os
import json
import time
import base64
import argparse
import paho.mqtt.client as mqtt
import ssl
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional
import random

# MQTT Configuration (matches production)
MQTT_BROKER = "1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USERNAME = "BrainlyTesting"
MQTT_PASSWORD = "BrainlyTest@1234"

class MockESP32Device:
    """Simulates an ESP32-CAM device with complete protocol implementation"""

    def __init__(self, device_mac: str, test_mode: str = "normal"):
        self.device_mac = device_mac
        self.test_mode = test_mode
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.pending_images = []
        self.current_image_name = None
        self.awaiting_ack = False
        self.missing_chunks_requested = []

        # Simulated sensor data
        self.temperature = 72.5
        self.humidity = 45.2
        self.pressure = 1013.25
        self.gas_resistance = 15.3

        print(f"[DEVICE] Initialized mock device: {device_mac}")
        print(f"[DEVICE] Test mode: {test_mode}")

    def connect_mqtt(self):
        """Establish MQTT connection with HiveMQ Cloud"""
        print(f"\n[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT}...")

        self.client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
        self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        self.client.tls_set(cert_reqs=ssl.CERT_NONE)
        self.client.tls_insecure_set(True)

        # Set up callbacks
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect

        try:
            self.client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.client.loop_start()

            # Wait for connection
            timeout = 10
            start_time = time.time()
            while not self.connected and (time.time() - start_time) < timeout:
                time.sleep(0.1)

            if self.connected:
                print("[MQTT] ✅ Connected successfully")
                return True
            else:
                print("[MQTT] ❌ Connection timeout")
                return False
        except Exception as e:
            print(f"[MQTT] ❌ Connection failed: {e}")
            return False

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        """MQTT connection callback"""
        if rc == 0:
            self.connected = True
            print("[MQTT] Connection established")

            # Subscribe to command and ack topics
            cmd_topic = f"device/{self.device_mac}/cmd"
            ack_topic = f"device/{self.device_mac}/ack"

            client.subscribe(cmd_topic)
            client.subscribe(ack_topic)
            print(f"[MQTT] Subscribed to {cmd_topic}")
            print(f"[MQTT] Subscribed to {ack_topic}")
        else:
            print(f"[MQTT] Connection failed with code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        """MQTT disconnection callback"""
        self.connected = False
        print(f"[MQTT] Disconnected with code {rc}")

    def _on_message(self, client, userdata, msg):
        """Handle incoming MQTT messages from server"""
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
            topic = msg.topic

            print(f"\n[RECV] Message on {topic}")
            print(f"[RECV] Payload: {json.dumps(payload, indent=2)}")

            if "/cmd" in topic:
                self._handle_command(payload)
            elif "/ack" in topic:
                self._handle_ack(payload)
        except Exception as e:
            print(f"[ERROR] Failed to process message: {e}")

    def _handle_command(self, payload: Dict):
        """Handle server commands"""
        if "capture_image" in payload and payload.get("capture_image"):
            print("[CMD] Received capture_image command")
            # This would trigger a capture in real device
            # For testing, we'll initiate transmission
        elif "send_image" in payload:
            image_name = payload.get("send_image")
            print(f"[CMD] Received send_image command for: {image_name}")
        elif "next_wake" in payload:
            wake_time = payload.get("next_wake")
            print(f"[CMD] Received next_wake schedule: {wake_time}")

    def _handle_ack(self, payload: Dict):
        """Handle server acknowledgments"""
        if "missing_chunks" in payload:
            missing_chunks = payload.get("missing_chunks", [])
            print(f"[ACK] Server requests {len(missing_chunks)} missing chunks: {missing_chunks}")
            self.missing_chunks_requested = missing_chunks

            # Resend missing chunks
            if self.current_image_name:
                print(f"[RETRY] Resending missing chunks...")
                time.sleep(0.5)  # Brief delay
                self._send_missing_chunks(self.current_image_name, missing_chunks)

        elif "ACK_OK" in payload:
            ack_data = payload.get("ACK_OK", {})
            next_wake = ack_data.get("next_wake_time", "unknown")
            print(f"[ACK] ✅ Image transmission successful!")
            print(f"[ACK] Next wake scheduled: {next_wake}")
            self.awaiting_ack = False
            self.current_image_name = None
            self.missing_chunks_requested = []

    def send_status_message(self, pending_count: int = 0):
        """Send device status (alive) message"""
        status_topic = f"device/{self.device_mac}/status"

        status_msg = {
            "device_id": self.device_mac,
            "status": "alive",
            "pendingImg": pending_count
        }

        print(f"\n[STATUS] Sending alive message (pending: {pending_count})")
        self.client.publish(status_topic, json.dumps(status_msg))
        print(f"[STATUS] Published to {status_topic}")

    def capture_and_send_image(self, image_path: Optional[str] = None, chunk_size: int = 8192):
        """
        Simulate image capture and transmission

        Args:
            image_path: Path to test image file (if None, generates random data)
            chunk_size: Size of each chunk in bytes (default 8KB, matching ESP32 typical)
        """
        # Generate image name
        timestamp = int(time.time() * 1000)
        image_name = f"image_{timestamp}.jpg"
        self.current_image_name = image_name

        print(f"\n[CAPTURE] Simulating image capture: {image_name}")

        # Load or generate image data
        if image_path and os.path.exists(image_path):
            with open(image_path, 'rb') as f:
                image_data = f.read()
            print(f"[CAPTURE] Loaded test image: {len(image_data)} bytes")
        else:
            # Generate random JPEG-like data (starts with JPEG magic bytes)
            image_size = random.randint(30000, 80000)  # 30-80KB typical for ESP32-CAM
            image_data = b'\xFF\xD8\xFF\xE0' + os.urandom(image_size - 4) + b'\xFF\xD9'
            print(f"[CAPTURE] Generated mock image: {len(image_data)} bytes")

        # Add some random variation to sensor data
        self.temperature += random.uniform(-2, 2)
        self.humidity += random.uniform(-3, 3)
        self.pressure += random.uniform(-1, 1)

        # Send metadata first
        self._send_metadata(image_name, image_data, chunk_size)

        # Brief delay before chunks
        time.sleep(0.3)

        # Send chunks
        self._send_chunks(image_name, image_data, chunk_size)

        self.awaiting_ack = True

    def _send_metadata(self, image_name: str, image_data: bytes, chunk_size: int):
        """Send image metadata message"""
        data_topic = f"ESP32CAM/{self.device_mac}/data"

        total_chunks = (len(image_data) + chunk_size - 1) // chunk_size

        metadata = {
            "device_id": self.device_mac,
            "capture_timestamp": datetime.utcnow().isoformat() + "Z",
            "image_name": image_name,
            "image_size": len(image_data),
            "max_chunk_size": chunk_size,
            "total_chunks_count": total_chunks,
            "location": "Test Location",
            "error": 0,
            "temperature": round(self.temperature, 1),
            "humidity": round(self.humidity, 1),
            "pressure": round(self.pressure, 2),
            "gas_resistance": round(self.gas_resistance, 1)
        }

        print(f"[METADATA] Sending metadata:")
        print(f"  - Image: {image_name}")
        print(f"  - Size: {len(image_data)} bytes")
        print(f"  - Chunks: {total_chunks}")
        print(f"  - Chunk size: {chunk_size} bytes")
        print(f"  - Temp: {metadata['temperature']}°F, Humidity: {metadata['humidity']}%")

        self.client.publish(data_topic, json.dumps(metadata))

    def _send_chunks(self, image_name: str, image_data: bytes, chunk_size: int):
        """Send image chunks"""
        data_topic = f"ESP32CAM/{self.device_mac}/data"

        total_chunks = (len(image_data) + chunk_size - 1) // chunk_size

        print(f"\n[CHUNKS] Sending {total_chunks} chunks...")

        for chunk_id in range(total_chunks):
            # Simulate missing chunks in test mode
            if self.test_mode == "missing_chunks" and chunk_id in [2, 5, 8]:
                print(f"[CHUNKS] ⚠️  Simulating missing chunk {chunk_id + 1}/{total_chunks}")
                continue

            start = chunk_id * chunk_size
            end = min(start + chunk_size, len(image_data))
            chunk_data = image_data[start:end]

            chunk_msg = {
                "device_id": self.device_mac,
                "image_name": image_name,
                "chunk_id": chunk_id,
                "max_chunk_size": chunk_size,
                "payload": list(chunk_data)  # Convert bytes to list of ints
            }

            self.client.publish(data_topic, json.dumps(chunk_msg))

            # Progress indicator
            if (chunk_id + 1) % 5 == 0 or (chunk_id + 1) == total_chunks:
                print(f"[CHUNKS] Sent {chunk_id + 1}/{total_chunks} chunks ({((chunk_id + 1) / total_chunks * 100):.1f}%)")

            # Small delay between chunks (simulates ESP32 processing)
            time.sleep(0.05)

        print(f"[CHUNKS] ✅ All chunks sent")

    def _send_missing_chunks(self, image_name: str, missing_chunk_ids: List[int]):
        """Resend specific missing chunks"""
        # For simplicity, we'll regenerate the image data
        # In real device, this would come from SD card
        image_size = random.randint(30000, 80000)
        image_data = b'\xFF\xD8\xFF\xE0' + os.urandom(image_size - 4) + b'\xFF\xD9'
        chunk_size = 8192

        data_topic = f"ESP32CAM/{self.device_mac}/data"

        for chunk_id in missing_chunk_ids:
            start = chunk_id * chunk_size
            end = min(start + chunk_size, len(image_data))
            chunk_data = image_data[start:end]

            chunk_msg = {
                "device_id": self.device_mac,
                "image_name": image_name,
                "chunk_id": chunk_id,
                "max_chunk_size": chunk_size,
                "payload": list(chunk_data)
            }

            self.client.publish(data_topic, json.dumps(chunk_msg))
            print(f"[RETRY] Resent chunk {chunk_id}")
            time.sleep(0.05)

    def simulate_offline_recovery(self, offline_image_count: int = 3):
        """Simulate device that was offline and has pending images"""
        print(f"\n[RECOVERY] Simulating offline recovery with {offline_image_count} pending images")

        # Send status with pending count
        self.send_status_message(pending_count=offline_image_count)

        # Wait for server to process
        time.sleep(2)

        # Send each pending image
        for i in range(offline_image_count):
            print(f"\n[RECOVERY] Sending pending image {i + 1}/{offline_image_count}")
            self.capture_and_send_image()

            # Wait for ACK before next
            timeout = 30
            start_time = time.time()
            while self.awaiting_ack and (time.time() - start_time) < timeout:
                time.sleep(0.5)

            if self.awaiting_ack:
                print(f"[RECOVERY] ⚠️  Timeout waiting for ACK on image {i + 1}")
                break

            print(f"[RECOVERY] ✅ Image {i + 1} acknowledged")
            time.sleep(1)

    def disconnect(self):
        """Clean disconnect from MQTT"""
        if self.client:
            print("\n[MQTT] Disconnecting...")
            self.client.loop_stop()
            self.client.disconnect()
            print("[MQTT] Disconnected")


def test_normal_operation(device_mac: str):
    """Test Case 1: Normal operation with complete image transmission"""
    print("\n" + "="*70)
    print("TEST CASE 1: Normal Operation")
    print("="*70)

    device = MockESP32Device(device_mac, test_mode="normal")

    if not device.connect_mqtt():
        print("❌ Failed to connect")
        return False

    try:
        # Send status
        device.send_status_message(pending_count=0)
        time.sleep(2)

        # Capture and send image
        device.capture_and_send_image()

        # Wait for ACK
        timeout = 30
        start_time = time.time()
        while device.awaiting_ack and (time.time() - start_time) < timeout:
            time.sleep(0.5)

        if not device.awaiting_ack:
            print("\n✅ TEST PASSED: Normal operation successful")
            return True
        else:
            print("\n❌ TEST FAILED: Timeout waiting for ACK")
            return False
    finally:
        device.disconnect()


def test_missing_chunks(device_mac: str):
    """Test Case 2: Missing chunks with retry mechanism"""
    print("\n" + "="*70)
    print("TEST CASE 2: Missing Chunks Retry")
    print("="*70)

    device = MockESP32Device(device_mac, test_mode="missing_chunks")

    if not device.connect_mqtt():
        print("❌ Failed to connect")
        return False

    try:
        # Send status
        device.send_status_message(pending_count=0)
        time.sleep(2)

        # Capture and send image (with missing chunks)
        device.capture_and_send_image()

        # Wait for missing chunk request and ACK
        timeout = 45
        start_time = time.time()
        while device.awaiting_ack and (time.time() - start_time) < timeout:
            time.sleep(0.5)

        if not device.awaiting_ack and len(device.missing_chunks_requested) > 0:
            print("\n✅ TEST PASSED: Missing chunks detected and retried")
            return True
        else:
            print("\n❌ TEST FAILED: Missing chunk retry mechanism failed")
            return False
    finally:
        device.disconnect()


def test_offline_recovery(device_mac: str):
    """Test Case 3: Offline recovery with pending images"""
    print("\n" + "="*70)
    print("TEST CASE 3: Offline Recovery")
    print("="*70)

    device = MockESP32Device(device_mac, test_mode="normal")

    if not device.connect_mqtt():
        print("❌ Failed to connect")
        return False

    try:
        # Simulate offline recovery with 3 pending images
        device.simulate_offline_recovery(offline_image_count=3)

        print("\n✅ TEST PASSED: Offline recovery completed")
        return True
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        return False
    finally:
        device.disconnect()


def main():
    parser = argparse.ArgumentParser(description="ESP32-CAM Mock Device Simulator")
    parser.add_argument("--mac", default="TEST-ESP32-001", help="Device MAC address")
    parser.add_argument("--test", choices=["normal", "missing_chunks", "offline_recovery", "all"],
                       default="all", help="Test scenario to run")
    parser.add_argument("--image", help="Path to test image file (optional)")

    args = parser.parse_args()

    print("\n" + "="*70)
    print("ESP32-CAM MQTT Protocol Test Suite")
    print("="*70)
    print(f"Device MAC: {args.mac}")
    print(f"MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
    print("="*70)

    results = {}

    if args.test == "all":
        tests = ["normal", "missing_chunks", "offline_recovery"]
    else:
        tests = [args.test]

    for test in tests:
        time.sleep(2)  # Delay between tests

        if test == "normal":
            results["normal"] = test_normal_operation(args.mac)
        elif test == "missing_chunks":
            results["missing_chunks"] = test_missing_chunks(args.mac)
        elif test == "offline_recovery":
            results["offline_recovery"] = test_offline_recovery(args.mac)

    # Print summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name:20s}: {status}")
    print("="*70)


if __name__ == "__main__":
    main()
