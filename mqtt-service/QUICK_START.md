# Quick Start Guide - MQTT Device Handler

## ✅ What We've Built

You now have a **production-ready MQTT service** that:

- ✅ Maintains 24/7 persistent MQTT connection
- ✅ Auto-provisions devices on first connection
- ✅ Processes chunked images from ESP32-CAM devices
- ✅ Creates submissions and observations automatically
- ✅ Includes health monitoring endpoints
- ✅ Ready to deploy to Railway, Render, or Docker

## 🚀 Next Steps

### Step 1: Get Your Supabase Service Role Key

1. Go to: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/settings/api
2. Scroll down to "Project API keys"
3. Copy the **`service_role`** key (NOT the anon key!)
4. Keep it secure - this gives full database access

### Step 2: Choose Your Deployment Method

#### Option A: Deploy to Railway (Recommended)

**Why Railway?**
- ✅ Easiest setup (5 minutes)
- ✅ Free tier available
- ✅ Auto-deploys on git push
- ✅ Built-in monitoring and logs
- ✅ ~$5/month for production

**Deploy Steps:**

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Navigate to service directory
cd mqtt-service

# 4. Initialize project
railway init

# 5. Set environment variables
railway variables set SUPABASE_URL=https://jycxolmevsvrxmeinxff.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
railway variables set MQTT_HOST=1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud
railway variables set MQTT_PORT=8883
railway variables set MQTT_USERNAME=BrainlyTesting
railway variables set MQTT_PASSWORD=BrainlyTest@1234

# 6. Deploy
railway up

# 7. Check logs
railway logs -f
```

**You should see:**
```
[MQTT] ✅ Connected to HiveMQ Cloud
[MQTT] ✅ Subscribed to ESP32CAM/+/data
[MQTT] ✅ Subscribed to device/+/status
[SERVICE] 🚀 MQTT Device Handler is ready!
```

**Get service URL:**
```bash
railway status
# Copy the public URL (e.g., https://your-service.railway.app)
```

**Test it:**
```bash
curl https://your-service.railway.app/health
```

---

#### Option B: Deploy to Render

**Why Render?**
- ✅ Free tier with 750 hours/month
- ✅ Good for testing before production
- ✅ Web-based setup (no CLI needed)
- ✅ $7/month for always-on

**Deploy Steps:**

1. **Push code to GitHub** (if not already)
   ```bash
   cd mqtt-service
   git add .
   git commit -m "Add MQTT service"
   git push
   ```

2. **Create Render Account**: https://render.com

3. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - **Root Directory**: `mqtt-service`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. **Add Environment Variables** (in Render dashboard):
   ```
   SUPABASE_URL=https://jycxolmevsvrxmeinxff.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_key_here
   MQTT_HOST=1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud
   MQTT_PORT=8883
   MQTT_USERNAME=BrainlyTesting
   MQTT_PASSWORD=BrainlyTest@1234
   PORT=3000
   ```

5. **Click "Create Web Service"**

6. **Monitor Logs** in Render dashboard

7. **Get URL** from Render dashboard (e.g., `https://your-service.onrender.com`)

8. **Test**:
   ```bash
   curl https://your-service.onrender.com/health
   ```

---

#### Option C: Run Locally (For Testing)

**Why Local?**
- ✅ Immediate testing
- ✅ Full control
- ✅ No cost
- ❌ Only works while your computer is on

**Setup:**

1. **Navigate to service directory**:
   ```bash
   cd mqtt-service
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Create .env file**:
   ```bash
   cp .env.example .env
   ```

4. **Edit .env** with your Supabase service role key:
   ```bash
   nano .env  # or use your favorite editor
   ```

5. **Start service**:
   ```bash
   npm start
   ```

6. **Verify** in another terminal:
   ```bash
   curl http://localhost:3000/health
   ```

---

### Step 3: Test Device Auto-Provisioning

Once your service is running, test it:

```bash
# From project root
node test-mqtt-provisioning.mjs
```

**Expected Output:**
```
✅ Status message published
⏳ Waiting for auto-provisioning (5 seconds)...
✅ Device was auto-provisioned!
   Device Code: DEVICE-ESP32S3-001
   Status: pending_mapping
```

**In your service logs, you should see:**
```
[MQTT] 📨 Message on device/{MAC}/status: {"device_id":"...","status":"alive"...}
[STATUS] Device {MAC} is alive, pending images: 0
[AUTO-PROVISION] Device {MAC} not found, attempting auto-provision...
[SUCCESS] Auto-provisioned device {MAC} with code DEVICE-ESP32S3-001
```

---

### Step 4: Verify in UI

1. **Open your web app**: https://your-app-url.com/devices

2. **You should see**:
   - Yellow "Pending Devices" banner at top
   - Device listed with code DEVICE-ESP32S3-001
   - Status: "Pending Mapping"
   - "Map Device" button

3. **Click "Map Device"**:
   - Select a Program
   - Select a Site
   - Click "Map Device"

4. **Device is now active!**
   - Can capture images
   - Can upload data
   - Appears as "Active" in device list

---

## 🎯 How It Works

```
┌─────────────────────────────────────────────────────────┐
│  ESP32-CAM Device (Field)                              │
└─────────────────────────────────────────────────────────┘
                      │
                      │ Publishes to:
                      │ device/{MAC}/status
                      ↓
┌─────────────────────────────────────────────────────────┐
│  HiveMQ Cloud Broker                                    │
│  (MQTT Broker - Always Running)                        │
└─────────────────────────────────────────────────────────┘
                      │
                      │ Persistent Connection
                      ↓
┌─────────────────────────────────────────────────────────┐
│  MQTT Device Handler (This Service)                    │
│  • Listens 24/7 for device messages                    │
│  • Checks if device exists in database                 │
│  • If not found: Auto-provisions with unique code      │
│  • Updates device last_seen_at                         │
└─────────────────────────────────────────────────────────┘
                      │
                      │ Database Operations
                      ↓
┌─────────────────────────────────────────────────────────┐
│  Supabase Database                                      │
│  • devices table updated                               │
│  • Junction tables for assignments                     │
│  • Real-time subscriptions notify UI                   │
└─────────────────────────────────────────────────────────┘
                      │
                      │ Real-time Update
                      ↓
┌─────────────────────────────────────────────────────────┐
│  React Web App                                          │
│  • DevicesPage shows "Pending Devices" banner         │
│  • Admin clicks "Map Device"                           │
│  • Selects Program + Site                              │
│  • Device becomes operational                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Monitoring Your Service

### Railway

```bash
# View logs
railway logs -f

# Check service status
railway status

# View metrics
railway open  # Opens Railway dashboard
```

### Render

- Go to Render dashboard
- Click on your service
- Click "Logs" tab
- Monitor in real-time

### Local

```bash
# Logs are output to console
# Press Ctrl+C to stop
```

### Health Endpoint

Check service health at any time:

```bash
curl https://your-service-url/health
```

**Healthy Response:**
```json
{
  "status": "healthy",
  "mqtt": {
    "connected": true,
    "host": "1305ceddedc94b9fa7fba9428fe4624e.s1.eu.hivemq.cloud",
    "port": 8883
  },
  "supabase": {
    "url": "https://jycxolmevsvrxmeinxff.supabase.co",
    "configured": true
  },
  "stats": {
    "connected": true,
    "startedAt": "2024-11-08T10:00:00.000Z",
    "messagesReceived": 150,
    "devicesProvisioned": 5
  },
  "uptime": 3600
}
```

---

## ⚠️ Troubleshooting

### Service Won't Start

**Error: "supabaseUrl is required"**
- Missing environment variable
- Check: `railway variables` or Render dashboard
- Ensure `SUPABASE_URL` is set

**Error: "Invalid API key"**
- Wrong key or using anon key instead of service role
- Get correct key from: https://supabase.com/dashboard/project/jycxolmevsvrxmeinxff/settings/api
- Use **service_role** key (NOT anon key)

### MQTT Won't Connect

**Error: "Connection refused" or "Timeout"**
- Check MQTT broker is accessible
- Verify credentials in HiveMQ Cloud console
- Check firewall allows port 8883

**Error: "Authentication failed"**
- Wrong username/password
- Verify in HiveMQ Cloud dashboard
- Default: `BrainlyTesting` / `BrainlyTest@1234`

### Devices Not Auto-Provisioning

**Check logs for "AUTO-PROVISION" messages:**
```bash
railway logs | grep "AUTO-PROVISION"
```

**Common issues:**
- Service role key invalid or missing
- RLS policies blocking inserts (check Supabase dashboard)
- Device MAC format incorrect

**Test manually:**
```bash
node test-mqtt-provisioning.mjs
```

---

## 🎉 Success Checklist

- [ ] Service deployed and running
- [ ] Health endpoint returns `"status": "healthy"`
- [ ] MQTT shows as `"connected": true`
- [ ] Test device auto-provisions successfully
- [ ] Device appears in web UI with "Pending" status
- [ ] Can map device to site via UI
- [ ] Device status changes to "Active"

---

## 📞 Support

**Check logs first:**
- Railway: `railway logs -f`
- Render: Dashboard → Logs
- Local: Console output

**Common log messages:**

✅ **Good:**
```
[MQTT] ✅ Connected to HiveMQ Cloud
[MQTT] ✅ Subscribed to device/+/status
[SERVICE] 🚀 MQTT Device Handler is ready!
[AUTO-PROVISION] Attempting to provision new device
[SUCCESS] Auto-provisioned device with code DEVICE-ESP32S3-001
```

❌ **Problems:**
```
[ERROR] Device lookup failed: Invalid API key
→ Fix: Use service_role key, not anon key

[MQTT] ❌ Connection error: ECONNREFUSED
→ Fix: Check MQTT credentials and network

[ERROR] Failed to auto-provision device
→ Fix: Check RLS policies in Supabase
```

---

## 🚀 You're Ready!

Your MQTT device handler is production-ready. Deploy it using your preferred method above, then test with a real device or the test script.

**Next:**
1. Deploy service (Railway recommended)
2. Test auto-provisioning
3. Verify UI shows pending devices
4. Map a device to a site
5. Deploy real devices in field!

The complete flow is now operational! 🎉
