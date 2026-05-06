/**
 * ESLint config for Next.js apps (apps/web, apps/admin Next runtime).
 */
const base = require('./index.cjs');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...base,
  extends: [
    ...base.extends,
    'next/core-web-vitals',
    'next/typescript',
    'plugin:jsx-a11y/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    ...base.rules,
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
};
