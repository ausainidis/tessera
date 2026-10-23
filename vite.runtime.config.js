// Builds the course runtime that ships inside every published course (_tessera/).
import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BANNER = '/*! Tessera course runtime | Apache-2.0 | Copyright Tessera contributors */';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/runtime',
    emptyOutDir: true,
    target: 'es2021',
    minify: true,
    lib: {
      entry: 'src/renderer/runtime/index.js',
      formats: ['iife'],
      name: 'TesseraRuntime',
      fileName: () => 'runtime.js',
    },
  },
  plugins: [{
    name: 'tessera-runtime-assets',
    closeBundle() {
      mkdirSync('dist/runtime', { recursive: true });
      copyFileSync('src/renderer/runtime/base.css', 'dist/runtime/base.css');
      const js = readFileSync('dist/runtime/runtime.js', 'utf8');
      if (!js.startsWith('/*!')) writeFileSync('dist/runtime/runtime.js', `${BANNER}\n${js}`);
    },
  }],
});
