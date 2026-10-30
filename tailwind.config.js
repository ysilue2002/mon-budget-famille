/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Vert profond / vert sauge — palette sobre de l'application
        forest: {
          50: '#f3f9f4',
          100: '#e3f1e6',
          200: '#c7e3cd',
          300: '#9dcdaa',
          400: '#6db081',
          500: '#4a9463',
          600: '#36784e',
          700: '#2c6040',
          800: '#254d35',
          900: '#14532d',
          950: '#0b2e1b',
        },
        sage: {
          50: '#f6f7f4',
          100: '#e8ebe2',
          200: '#d3d9c9',
          300: '#b3bda6',
          400: '#909d80',
          500: '#6f7d61',
          600: '#56634a',
          700: '#444f3c',
          800: '#384133',
          900: '#2f372c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
