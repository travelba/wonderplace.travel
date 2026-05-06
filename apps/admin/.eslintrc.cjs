/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['@cct/config/eslint/next'],
  ignorePatterns: ['.next', 'node_modules', '.turbo', 'public', 'payload-types.ts'],
};
