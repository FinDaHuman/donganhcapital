import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        // react-plotly.js and plotly.js are CJS-only packages; force esbuild pre-bundling
        // so Vite 8/Rolldown doesn't break the __esModule default-export interop.
        include: ['react-plotly.js', 'plotly.js'],
    },
})
