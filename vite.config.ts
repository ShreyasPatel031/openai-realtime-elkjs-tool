import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@excalidraw/excalidraw', 'roughjs'],
  },
  resolve: {
    alias: {
      'roughjs/bin/rough': 'roughjs/bin/rough.js',
    },
  },
  define: {
    'process.env': {
      NODE_ENV: JSON.stringify(process.env.NODE_ENV),
    },
  },
  ssr: {
    noExternal: ['@excalidraw/excalidraw'],
  },
  build: {
    rollupOptions: {
      external: [/\.(test|spec)\.(ts|tsx)$/],
    },
  },
}); 