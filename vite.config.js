import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    legacyRawComponentsPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // On fournit notre propre manifest.json dans public/ — pas de génération auto
      manifest: false,
      includeAssets: ['favicon.ico', 'favicon.svg', 'icons/*.png', 'offline.html'],
      workbox: {
        // Cacher tous les assets statiques compilés par Vite
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Page hors-ligne servie quand une navigation échoue sans cache
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Appels Supabase : NetworkFirst — données fraîches prioritaires,
            // fallback sur cache 5 min max si réseau absent
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Google Fonts : StaleWhileRevalidate (cache immédiat, màj en fond)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 an
              },
            },
          },
        ],
      },
      devOptions: {
        // Désactivé en dev (évite les conflits HMR + SW)
        // Mettre à true pour tester le SW localement
        enabled: false,
      },
    }),
    productionIndexPlugin(),
  ],
  build: {
    outDir: 'dist-vite',
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: {
        app: 'vite-index.html'
      },
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-xlsx': ['xlsx'],
        }
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
