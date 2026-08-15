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
      // 'prompt' : le nouveau SW reste en attente, l'UI (bandeau) propose
      // « Mettre à jour » qui l'active puis recharge. Pas de skipWaiting en
      // pleine session : les chunks lazy du bundle courant restent servis
      // jusqu'au rechargement choisi (pas de vieux bundle cassé après release).
      // Sans action, la mise à jour s'applique au prochain démarrage de l'app.
      registerType: 'prompt',
      // On fournit notre propre manifest.json dans public/ : pas de génération auto
      manifest: false,
      includeAssets: ['favicon.ico', 'favicon.svg', 'icons/*.png'],
      workbox: {
        // Précache de tous les assets statiques compilés par Vite : app shell
        // servi cache-first, revalidé en arrière-plan à chaque release.
        // ttf : les polices de marque embarquées dans les PDF (public/fonts).
        // Sans elles dans le précache, un export lancé hors-ligne sortirait
        // dans la police de repli - la cuisine imprime sans réseau.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}'],
        // Navigation offline → app shell précaché, l'app boote sans réseau.
        // Pas '/index.html' : la copie dist est faite par productionIndexPlugin
        // APRÈS la génération du SW, elle n'est donc pas dans le précache.
        navigateFallback: '/vite-index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // Caches runtime : l'ordre compte (première route qui matche gagne).
        // Les clés de cache sont les URL PostgREST complètes : le filtre
        // etablissement_id fait partie de la clé, aucun service cross-tenant
        // possible depuis le cache. Purge en plus au logout et au changement
        // d'établissement (src/services/offline/offlineCaches.js).
        // Tout est NetworkFirst (online strictement identique à avant, le
        // cache ne sert qu'en secours) ; /auth/ n'est volontairement JAMAIS caché.
        runtimeCaching: [
          {
            // Bibliothèque recettes (fiches, plats, cartes et liaisons) :
            // lecture hors-ligne = besoin métier, secours 30 jours.
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(recettes|plats|cartes|carte_plats|plat_recettes)\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sb-recettes',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Lectures critiques du boot (profil, établissements, permissions,
            // réglages) : secours 7 jours pour que l'app démarre hors-ligne
            // le lendemain matin.
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(profiles|etablissements|permissions|user_settings)\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sb-boot',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Shifts : la vue Pointage doit lister les shifts du jour
            // hors-ligne pour offrir les boutons de punch. Secours 7 jours.
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/shifts\b/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sb-shifts',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            // Photos de recettes (bucket public, chemins immuables) : cache-first.
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/recette-photos\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sb-photos',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Reste des lectures REST : filet court (micro-coupures).
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
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
