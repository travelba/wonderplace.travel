import type { Config } from 'tailwindcss';
import preset from '@cct/config/tailwind';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/seo/src/**/*.{ts,tsx}',
  ],
};

export default config;
