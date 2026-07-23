import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          50: '#FFF8F5',
          100: '#FFEDE7',
          200: '#FFDCD0',
          300: '#FFC3AE',
          400: '#FDA884',
          500: '#FC966E',
          600: '#FC966E',
          700: '#D8663F',
          800: '#A94D31',
          900: '#7F3B29',
          950: '#451B12',
        },
      },
      boxShadow: {
        panel: '0 20px 40px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [],
}

export default config
