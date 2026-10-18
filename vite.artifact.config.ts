import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Single-file build for pasting into an Artifact: React is loaded from a CDN,
// so it is left out of the bundle and read from the UMD globals.
export default defineConfig({
  plugins: [react({ jsxRuntime: 'classic' })],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-artifact',
    cssCodeSplit: false,
    lib: { entry: 'src/main.tsx', name: 'CheckerboardApp', formats: ['iife'], fileName: () => 'app.js' },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'jspdf'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM', jspdf: 'jspdf' } },
    },
  },
})
