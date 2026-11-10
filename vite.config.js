import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /field_team_dashboard/; the ERITAS
  // container sets BASE_PATH=/ because it has its own subdomain.
  base: process.env.BASE_PATH || '/field_team_dashboard/',
})
