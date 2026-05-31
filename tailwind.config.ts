import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Minimalistische, ruhige Palette fuer ein vertrauenswuerdiges UI.
        brand: {
          DEFAULT: '#1f3a5f',
          accent: '#2f6f9f',
        },
      },
    },
  },
  plugins: [],
};

export default config;
