/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          900: "#0a0e17",
          800: "#111827",
          700: "#1a2236",
          600: "#243049",
        },
      },
    },
  },
  plugins: [],
};
