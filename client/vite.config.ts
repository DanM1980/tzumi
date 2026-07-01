import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const localIP = '192.168.31.246';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': `http://${localIP}:3001`,
      '/ws': {
        target: `ws://${localIP}:3001`,
        ws: true,
      },
    },
  },
});
