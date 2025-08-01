import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis'
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'client/components/FramerEmbeddable.tsx'),
      name: 'ArchitectureGenerator',
      fileName: (format) => `architecture-generator.${format}.js`,
      formats: ['umd']
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: {
        globals: {
          'react': 'React',
          'react-dom': 'ReactDOM',
          'react-dom/client': 'ReactDOM'
        },
        exports: 'named'
      }
    },
    outDir: 'dist/embeddable'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client')
    }
  }
}) 