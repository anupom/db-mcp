import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT || '3001'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.BACKEND_PORT || '3000'}`,
        changeOrigin: true,
      },
      '/mcp': {
        target: `http://localhost:${process.env.BACKEND_PORT || '3000'}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://localhost:${process.env.BACKEND_PORT || '3000'}`,
        changeOrigin: true,
      },
      '/databases': {
        target: `http://localhost:${process.env.BACKEND_PORT || '3000'}`,
        changeOrigin: true,
      },
    },
  },
});
