import type { Config } from 'tailwindcss';

/**
 * Tailwind preset shared between apps/web, apps/admin and packages/ui.
 * Tokens come from CSS custom properties (see packages/ui/src/tokens.css)
 * so the design can be re-styled by overriding a single tokens file.
 */
const preset = {
  darkMode: ['class'],
  content: [],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1440px',
      },
    },
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        fg: 'var(--color-fg)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        accent: {
          DEFAULT: 'var(--color-accent-gold)',
          fg: 'var(--color-accent-fg)',
        },
        sage: 'var(--color-sage)',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
      },
      maxWidth: {
        prose: '68ch',
        editorial: '74rem',
      },
      transitionTimingFunction: {
        'editorial-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default preset;
