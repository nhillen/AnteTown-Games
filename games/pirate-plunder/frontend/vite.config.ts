import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      include: ['src/index.ts', 'src/components/**/*.tsx'],
      exclude: ['src/test/**', 'src/**/*.test.tsx']
    })
  ],
  optimizeDeps: {
    include: ['@pirate/game-warfaire']
  },
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 5173
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PiratePlunderClient',
      formats: ['es'],
      fileName: 'index'
    },
    // Enable type declarations
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: ['react', 'react-dom', 'socket.io-client'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'socket.io-client': 'io'
        }
      }
    },
    emptyOutDir: true
  }
})
