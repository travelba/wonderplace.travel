// ESLint flat config for Next.js apps (apps/web + apps/admin).
//
// Inherits the workspace base config, then layers Next.js / React / a11y
// recommendations. `next/core-web-vitals` is still distributed as a legacy
// config, so we proxy it through `@eslint/eslintrc`'s `FlatCompat` shim — this
// is the supported migration path for ESLint v9.
//
// `next/typescript` is intentionally NOT included: it redefines the
// `@typescript-eslint` plugin which is already provided by our base via
// `typescript-eslint`'s flat exports, and the resulting "Cannot redefine
// plugin" error is unrecoverable inside FlatCompat.

import { FlatCompat } from '@eslint/eslintrc';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import base from './base.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...base,
  ...compat.extends('next/core-web-vitals'),
  {
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    // FlatCompat may rewrite `parser` to `espree` while loading the Next legacy
    // config; rebind `@typescript-eslint/parser` so TS-aware rules from base
    // (no-unused-vars, no-explicit-any, …) see the correct AST.
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/no-unescaped-entities': 'off',
      'jsx-a11y/anchor-is-valid': 'error',
      '@next/next/no-html-link-for-pages': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../../*'],
              message: 'Use workspace path aliases (@cct/*) instead of deep relative imports.',
            },
          ],
        },
      ],
    },
  },
];
