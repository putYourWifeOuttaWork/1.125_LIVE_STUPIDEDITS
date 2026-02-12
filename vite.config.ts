import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react-dropzone', 'idb'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-d3': ['d3', 'd3-scale-chromatic', 'd3-time-format'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-swiper': ['swiper'],
        },
      },
    },
  },
});