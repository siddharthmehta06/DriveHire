import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': apiProxyTarget,
      '/uploads': apiProxyTarget,
      '/socket.io': { target: apiProxyTarget, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
  },
});
