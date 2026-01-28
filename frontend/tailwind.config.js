/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#111213', // Finpath Body RGB(17,18,19)
          secondary: '#1a1c1e', // Slightly lighter for elements
        },
        accent: {
          blue: '#2962ff',
          green: '#00c853', // Finpath Green
          red: '#e04040',   // Finpath Red
        },
        text: {
          primary: '#e0e0e0',
          secondary: '#9e9e9e',
        }
      }
    },
  },
  plugins: [],
}
