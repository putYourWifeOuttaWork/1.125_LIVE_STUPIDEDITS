import os
import json
import paho.mqtt.client as mqtt
from collections import defaultdict
import ssl
import time
import base64

# ========== Configuration ==========
MQTT_BROKER = "1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud"  # Or your HiveMQ instance
MQTT_PORT = 8883
MQTT_TOPIC = "ESP32CAM/B8F862F9CFB8/data"  #B8F862F9ECF8
MQTT_USERNAME = "BrainlyTesting"
MQTT_PASSWORD = "BrainlyTest@1234"

chunks = {}
image_name = None
max_chunks = None

# Store image chunks
image_chunks = defaultdict(lambda: {
    'max_chunks': None,
    'chunks': {},
    'received_count': 0
})


# Function to save image with a unique name
def save_image(image_key, image_name):
    chunks = image_chunks[image_key]['chunks']
    merged_bytes = b''.join(chunks[i] for i in sorted(chunks))

    # Create a unique filename (e.g., use a timestamp or any unique identifier)
    unique_image_name = f"{int(time.time() * 1000)}_{image_name}"  # Prefix with current timestamp to make it unique
    file_path = os.path.join("images", unique_image_name)

    # Ensure the "images" directory exists
    if not os.path.exists("images"):
        os.makedirs("images")

    # Save the merged image to the file
    with open(file_path, "wb") as f:
        f.write(merged_bytes)
    print(f"[✅] Image saved as: {file_path}")

    # Clear memory
    del image_chunks[image_key]

# ======= Callbacks =======
def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("[✔] Connected to MQTT Broker!")
        client.subscribe(MQTT_TOPIC)
        print(f"[🔔] Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"[❌] Failed to connect, return code {rc}")

# Callback for receiving messages (image chunks)
def on_message(client, userdata, msg):
    try:
        payload_str = msg.payload.decode('utf-8')
        payload = json.loads(payload_str)

        device_id = payload.get('device_id')
        image_name = payload.get('image_name')

        # Detect if this is metadata message (has total_chunk_count but no chunk_id)
        if 'total_chunk_count' in payload and 'chunk_id' not in payload:
            total_chunks = payload['total_chunk_count']
            # Store total_chunks info for this image_key
            image_key = f"{device_id}|{image_name}"
            # Initialize or update the dict for this image
            if image_key not in image_chunks:
                image_chunks[image_key] = {
                    'max_chunks': total_chunks,
                    'chunks': {},
                    'received_count': 0
                }
            else:
                image_chunks[image_key]['max_chunks'] = total_chunks

            print(f"[ℹ️] Metadata received for {image_name} with total chunks: {total_chunks}")

        # Else, this is a chunk message
        elif 'chunk_id' in payload:
            chunk_id = payload['chunk_id']
            chunk_bytes = base64.b64decode(payload['payload'])

            image_key = f"{device_id}|{image_name}"

            data = image_chunks[image_key]
            max_chunks = data['max_chunks']

            data['chunks'][chunk_id] = chunk_bytes
            data['received_count'] = len(data['chunks'])

            print(f"[📦] Received chunk {chunk_id + 1}/{max_chunks} for {image_name}")

            if data['received_count'] == max_chunks:
                print(f"[✅] All chunks received for {image_name}. Saving image...")
                save_image(image_key, image_name)
        else:
            print("[⚠️] Unknown message format received")

    except Exception as e:
        print(f"[⚠️] Error processing message: {e}")

# ========== MQTT Client ==========
client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

client.tls_set(cert_reqs=ssl.CERT_NONE)
client.tls_insecure_set(True)

client.on_connect = on_connect
client.on_message = on_message

print("[🚀] Connecting to MQTT broker...")
client.connect(MQTT_BROKER, MQTT_PORT, 60)

# Blocking loop
client.loop_forever()