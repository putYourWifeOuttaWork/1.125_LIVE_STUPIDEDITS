import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { data: devices } = await supabase.from('devices').select('device_name, device_mac, provisioning_status').limit(5);
console.log('Devices:', JSON.stringify(devices, null, 2));
const { data: images } = await supabase.from('device_images').select('image_name, status').limit(5);
console.log('\nImages:', JSON.stringify(images, null, 2));
