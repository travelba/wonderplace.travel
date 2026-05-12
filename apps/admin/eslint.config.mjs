import next from '@cct/config/eslint/next';

const config = [
  ...next,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.turbo/**',
      'public/**',
      'next-env.d.ts',
      'src/payload-types.ts',
    ],
  },
];

export default config;
