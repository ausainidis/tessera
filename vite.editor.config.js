// Builds the editor UI (React) into dist/editor. Vite is a development tool only:
// end users run the built files inside the desktop application.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src/editor',
  base: './',
  publicDir: false,
  plugins: [
    react(),
    {
      // In browser development mode, serve the built course runtime for the mock preview.
      name: 'tessera-dev-runtime',
      configureServer(server) {
        server.middlewares.use('/_tessera-dev', (req, res, next) => {
          const file = resolve('dist/runtime', req.url.replace(/^\/+/, '').split('?')[0]);
          if (!existsSync(file)) return next();
          res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
          res.end(readFileSync(file));
        });
      },
    },
  ],
  build: {
    outDir: '../../dist/editor',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5199, strictPort: true },
});
