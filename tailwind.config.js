/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'j-bg': '#0c0c0e',
        'j-surface': '#141416',
        'j-raised': '#1c1c1f',
        'j-hover': '#232328',
        'j-accent': '#d4a04a',
        'j-accent-hover': '#c08930',
        'j-text': '#f0ece4',
        'j-secondary': '#9a9590',
        'j-tertiary': '#6b6560',
        'j-muted': '#4a4540',
        'j-me': '#4a9ead',
        'j-partner': '#c67a3c',
        'j-success': '#5a9e6f',
        'j-error': '#c25050',
      },
      fontFamily: {
        'display': ['Sora', 'system-ui', 'sans-serif'],
        'mono': ['Space Mono', 'SF Mono', 'monospace'],
        'system': ['Sora', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in-up': 'fadeInUp 0.4s ease-out both',
        'fade-in': 'fadeIn 0.3s ease-out both',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      transitionDuration: {
        '150': '150ms',
      },
    },
  },
  plugins: [],
}
