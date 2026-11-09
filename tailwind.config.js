/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // eHA brand: blue 100/80/60/40/20% and green (lime) accents
          50:  '#e6f4ff',
          100: '#cce9fe',
          200: '#99d3fe',
          300: '#66bcfd',
          400: '#33a6fd',
          500: '#0090fc',  // eHA blue - primary
          600: '#0078d4',  // darker step for text/buttons on white (contrast)
          700: '#005fa8',
          lime: '#e2ee64', // eHA green 100%
          'lime-40': '#f3f8c1',
          'lime-20': '#f9fce0',
        },
        surface: {
          DEFAULT: '#f7f6f2',
          card: '#ffffff',
          border: '#e8e7e0',
          muted: '#f2f1ec',
        },
        ink: {
          DEFAULT: '#1a1a18',
          secondary: '#4a4a46',
          muted: '#8a8a84',
          faint: '#c4c4be',
        },
        status: {
          green:  '#1D9E75',
          amber:  '#d97706',
          red:    '#dc2626',
          blue:   '#2563eb',
          purple: '#7c3aed',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)',
        'card-lg': '0 8px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      }
    },
  },
  plugins: [],
}
