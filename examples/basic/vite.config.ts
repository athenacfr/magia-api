import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { magiaApi } from 'magia-api/vite'

export default defineConfig({
  plugins: [magiaApi(), react()],
})
