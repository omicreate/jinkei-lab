import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages（https://omicreate.github.io/jinkei-lab/）配信のためのベースパス
  base: '/jinkei-lab/',
  plugins: [react()],
})
