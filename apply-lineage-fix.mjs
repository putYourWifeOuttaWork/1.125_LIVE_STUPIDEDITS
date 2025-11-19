import { readFileSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config();

// Extract just the CREATE FUNCTION part
const fullSQL = readFileSync('./supabase/migrations/20251111120000_device_lineage_resolver.sql', 'utf8');

console.log('📋 COPY AND PASTE THIS SQL INTO YOUR SUPABASE SQL EDITOR:');
console.log('='.repeat(80));
console.log(fullSQL);
console.log('='.repeat(80));
console.log('\n✅ After running this in Supabase SQL Editor, your device lineage resolver will be fixed!');
