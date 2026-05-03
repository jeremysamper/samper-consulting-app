import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function legacyRawComponentsPlugin() {
  const componentsDir = path.join(rootDir, 'components');

  return {
    name: 'samper-legacy-raw-components',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url?.split('?')[0] || '';
        const decodedUrl = decodeURIComponent(rawUrl).replace(/\\/g, '/');

        if (!decodedUrl.startsWith('/components/')) {
          next();
          return;
        }

        const relativePath = decodedUrl.replace('/components/', '');
        const filePath = path.normalize(path.join(componentsDir, relativePath));
        const relativeFromComponents = path.relative(componentsDir, filePath);

        if (relativeFromComponents.startsWith('..') || path.isAbsolute(relativeFromComponents)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }

        const ext = path.extname(filePath);
        res.setHeader(
          'Content-Type',
          ext === '.js' ? 'application/javascript; charset=utf-8' : 'text/plain; charset=utf-8'
        );
        res.end(fs.readFileSync(filePath));
      });
    }
  };
}

function productionIndexPlugin() {
  return {
    name: 'samper-production-index',
    apply: 'build',
    closeBundle() {
      const distDir = path.join(rootDir, 'dist-vite');
      const viteHtml = path.join(distDir, 'vite-index.html');
      const indexHtml = path.join(distDir, 'index.html');

      if (fs.existsSync(viteHtml)) {
        fs.copyFileSync(viteHtml, indexHtml);
      }
    }
  };
}

export default defineConfig({
  plugins: [legacyRawComponentsPlugin(), react(), productionIndexPlugin()],
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: {
        app: 'vite-index.html'
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  },
  preview: {
    port: 4173,
    strictPort: false
  }
});
