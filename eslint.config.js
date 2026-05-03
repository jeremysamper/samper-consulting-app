import reactHooks from 'eslint-plugin-react-hooks';

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
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
