import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Previously provided by the Base44 vite plugin.
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
