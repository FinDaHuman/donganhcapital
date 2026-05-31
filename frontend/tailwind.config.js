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
          void:     '#060B14',
          base:     '#0A1020',
          surface:  '#0E1729',
          elevated: '#132035',
          overlay:  '#192845',
          input:    '#0C1828',
        },
        gold: {
          bright:  '#E8C97A',
          DEFAULT: '#C9A96E',
          muted:   '#A38550',
        },
        navy: {
          light: '#2A4070',
          mid:   '#1A2B50',
          deep:  '#0F1E3A',
        },
        text: {
          primary:   '#EDE8DA',
          secondary: '#94A3BC',
          muted:     '#4E617A',
        },
        market: {
          up:      '#4DB882',
          down:    '#E05555',
          neutral: '#C9A96E',
          ceiling: '#C77DFF',
          floor:   '#00D4FF',
        },
        accent: {
          gold:  '#C9A96E',
          blue:  '#4A7FD4',
          green: '#4DB882',
          red:   '#E05555',
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'Times New Roman', 'serif'],
        heading: ['Outfit', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        body:    ['Outfit', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono:    ['DM Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        widest: '0.25em',
        ultra:  '0.35em',
      },
    },
  },
  plugins: [],
}
