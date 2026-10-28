import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:lan` serves over HTTPS on the LAN so phones get a secure
// context (needed for WebRTC, Web Share and Wake Lock).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'lan' ? [basicSsl()] : [],
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
