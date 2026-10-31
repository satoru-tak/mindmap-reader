import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base: './' so the build works from any sub-path (artifact preview, GitHub Pages, etc.)
export default defineConfig({
  base: './',
  plugins: [react()],
})
