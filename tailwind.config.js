/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        good: '#16a34a',
        fair: '#f59e0b',
        poor: '#ef4444',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(2,6,23,0.08)',
      },
    },
  },
  darkMode: 'media',
  plugins: [],
}
