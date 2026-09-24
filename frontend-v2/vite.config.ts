import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        // Default: локалниот API (5300). start-dev.ps1 режимот „FE → прод" го
        // насочува кон https://116.202.8.155.sslip.io преку VITE_PROXY_TARGET.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5300',
        changeOrigin: true,
      },
    },
  },
});
