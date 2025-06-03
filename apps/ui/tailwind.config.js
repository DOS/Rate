/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/@radix-ui/react-*/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: 'hsl(243, 75%, 59%)',
          50: 'hsl(240, 100%, 99%)',
          100: 'hsl(240, 100%, 98%)',
          200: 'hsl(240, 91%, 96%)',
          300: 'hsl(241, 91%, 92%)',
          400: 'hsl(241, 90%, 88%)',
          500: 'hsl(243, 87%, 82%)',
          600: 'hsl(243, 75%, 59%)',
          700: 'hsl(243, 75%, 59%)',
          800: 'hsl(243, 75%, 59%)',
          900: 'hsl(243, 75%, 59%)',
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
    require('@tailwindcss/aspect-ratio'),
  ],
};
