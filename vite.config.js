import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages path: https://ehealthafrica.github.io/field_team_dashboard/
export default defineConfig({
  plugins: [react()],
  base: '/field_team_dashboard/',
})
