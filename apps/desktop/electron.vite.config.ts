import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // @kaizer/core es TypeScript fuente del monorepo: se empaqueta dentro del main.
    build: { externalizeDeps: { exclude: ['@kaizer/core'] } }
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].js' } }
    }
  },
  renderer: {
    plugins: [react()]
  }
})
