import reactHooks from 'eslint-plugin-react-hooks';

// Globals du navigateur sur lesquels le front s'appuie. Liste explicite plutôt
// qu'une dépendance : elle documente la surface réellement utilisée, et une
// nouvelle API y sera ajoutée sciemment.
//
// Elle sert la règle no-undef, seul filet contre la faute de frappe sur un
// identifiant : ni Vite ni Rollup ne s'en plaignent, ils prennent tout
// identifiant inconnu pour un global et laissent passer jusqu'au runtime.
const GLOBALS_NAVIGATEUR = [
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'self', 'globalThis',
  'console', 'fetch', 'Request', 'Response', 'Headers', 'FormData', 'URL', 'URLSearchParams',
  'Blob', 'File', 'FileReader', 'FileList', 'DataTransfer', 'Image', 'Audio',
  'Event', 'CustomEvent', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'AbortController', 'AbortSignal', 'NodeFilter',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'localStorage', 'sessionStorage', 'indexedDB', 'IDBKeyRange', 'caches',
  'crypto', 'performance', 'matchMedia', 'getComputedStyle',
  'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'scrollTo',
  'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLCanvasElement',
  'Node', 'Element', 'DOMParser', 'XMLSerializer', 'SVGElement',
  'Worker', 'MessageChannel', 'BroadcastChannel', 'OffscreenCanvas',
  'ImageData', 'createImageBitmap', 'structuredClone', 'queueMicrotask',
  'TextEncoder', 'TextDecoder', 'btoa', 'atob', 'ReadableStream',
  'process', 'CSS', 'DOMMatrix', 'Path2D',
];

// Globals hérités du front vanille, installés sur window par src/legacy/.
const GLOBALS_LEGACY = ['scResetAllData'];

export default [
  {
    ignores: [
      'dist-vite/**',
      'node_modules/**',
      'tools-node/**',
      'components/**',
    ],
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: Object.fromEntries(
        [...GLOBALS_NAVIGATEUR, ...GLOBALS_LEGACY].map(g => [g, 'readonly']),
      ),
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Attrape la variable jamais déclarée. Un « r is not defined » est parti
      // en production le 13.08.2026 : lint et build étaient verts, le bundle
      // s'est construit sans broncher, et l'écran de scan plantait à l'usage.
      'no-undef': 'error',
    },
  },
  {
    files: [
      'src/modules/**/*.{js,jsx}',
      'src/layouts/AppLayout.jsx',
      'src/data/legacyData.js',
    ],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
