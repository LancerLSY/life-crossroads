import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
export default tseslint.config(
  { ignores: ['dist', 'dist-pages', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks, 'react-refresh': refresh }, rules: { ...hooks.configs.recommended.rules, 'no-control-regex': 'off', 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] } },
  { files: ['**/*.mjs'], rules: { 'no-control-regex': 'off' }, languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', Response: 'readonly', URL: 'readonly', fetch: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly' } } },
);
