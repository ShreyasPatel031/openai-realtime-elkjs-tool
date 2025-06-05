import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const path = fileURLToPath(import.meta.url);

export default defineConfig({
  root: join(dirname(path), "client"),
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
    target: 'esnext',
    rollupOptions: {
      external: [/\.(test|spec)\.(ts|tsx)$/],
    },
  },
}); 