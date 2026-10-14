import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // relative asset URLs: the build works from any sub-folder or static host
  base: './',
  build: {
    target: 'es2022',
    // three.js is big by nature; it lives in its own lazily loaded chunk
    chunkSizeWarningLimit: 1600,
  },
})
