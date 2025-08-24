import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
    // Prevent React DevTools and other development features
    '__DEV__': false,
    '__REACT_DEVTOOLS_GLOBAL_HOOK__': 'undefined'
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
    outDir: 'dist/embeddable',
    // Optimize for embedded environments
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console for debugging
        drop_debugger: true
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client')
    }
  }
}) 