import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/data/**', '**/coverage/**'] },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'shared/**/*.js', 'scripts/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['client/**/*.{js,jsx}', 'shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    rules: {
      // JSX identifiers count as used.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['server/**/*.js'],
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['**/test/**/*.{js,jsx}', 'client/vite.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
