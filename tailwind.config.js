/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        line2: 'rgb(var(--c-line2) / <alpha-value>)',
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--c-accent-fg) / <alpha-value>)',
        // Amber accents (double-booked, error cards) — tokenised so they darken
        // on a light background instead of washing out.
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        'warn-line': 'rgb(var(--c-warn-line) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        // Display face for headings — the brand sheet specifies Canela, which is
        // commercial; Instrument Serif is the free stand-in with the same warm,
        // high-contrast character. Headings only — it's a display face and gets
        // fragile at UI sizes, so body/labels stay sans.
        display: ['Instrument Serif', 'Canela', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
