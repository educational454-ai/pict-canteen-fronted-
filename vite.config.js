import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Ye line xlsx library ko global define karne mein help karegi
    global: 'window', 
  },
  optimizeDeps: {
    include: ['xlsx'],
  },
});