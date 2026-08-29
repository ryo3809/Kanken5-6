import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // iPad の Safari から、同じWi-Fi上のパソコンにアクセスできるようにする
  server: { host: true, port: 5173 },
  build: { outDir: 'dist' },
});
