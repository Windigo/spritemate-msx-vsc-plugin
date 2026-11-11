import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export default defineConfig({
  publicDir: false,
  plugins: [{
    name: 'disable-editor-dev-cache',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        delete request.headers['if-none-match'];
        delete request.headers['if-modified-since'];
        for (const [name, value] of Object.entries(noCacheHeaders)) response.setHeader(name, value);
        next();
      });
    },
  }],
  server: {
    headers: noCacheHeaders,
    watch: { usePolling: true, interval: 250 },
  },
  preview: { headers: noCacheHeaders },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: path.resolve(__dirname, 'msx.html'),
    },
  },
  base: './', // Make sure this is correct for production
});
