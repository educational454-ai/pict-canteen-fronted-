import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['xlsx'], // Forces Vite to pre-bundle the library
  },
  build: {
    commonjsOptions: {
      include: [/xlsx/, /node_modules/], // Ensures CommonJS compatibility on Vercel
    },
  },
});