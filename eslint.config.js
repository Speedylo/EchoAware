import js from '@eslint/js';
import globals from 'globals';
import vitest from 'eslint-plugin-vitest';

export default [
  // Base recommended rules for all source files
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      // Ignore unused function parameters — stubs declare signatures before implementation
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },

  // Test files — vitest globals + recommended vitest rules
  {
    files: ['tests/**/*.test.js'],
    ...js.configs.recommended,
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...vitest.environments.env.globals,
      },
    },
  },

  // Ignore build output and dependencies
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
