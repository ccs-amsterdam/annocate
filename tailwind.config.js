/** @type {import('tailwindcss').Config} */

const baseFontSize = 16;
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            hyphens: "auto",
          },
        },
      },
      fontSize: {
        variable: "var(--font-size)",
      },
      colors: {
        text: {
          DEFAULT: "var(--text)",
          fixed: "var(--text-fixed)",
          light: "var(--text-light)",
          inversed: {
            DEFAULT: "var(--text-inversed)",
            fixed: "var(--text-inversed-fixed)",
          },
        },
        background: {
          DEFAULT: "var(--background)",
          transparent: "var(--background-transparent)",
          fixed: "var(--background-fixed)",
          inversed: {
            DEFAULT: "var(--background-inversed)",
            fixed: "var(--background-inversed-fixed)",
          },
        },
        primary: {
          DEFAULT: "var(--primary)",
          dark: "var(--primary-dark)",
          light: "var(--primary-light)",
          text: "var(--primary-text)",
          transparent: "var(--primary-transparent)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          dark: "var(--secondary-dark)",
          light: "var(--secondary-light)",
        },
        menu: {
          DEFAULT: "var(--menu)",
        },
        shadow: "var(--shadow)",
        lightgrey: "var(--lightgrey)",
        grey: "var(--grey)",
        darkgrey: "var(--darkgrey)",
        border: "var(--border)",
        green: "var(--green)",
        red: "var(--red)",
        lightred: "var(--lightred)",
        orange: "var(--orange)",

        inactive: "var(--inactive)",
        active: "var(--active)",
      },

      //change spacing and fontsize to work with 62.5% trick
      spacing: () => ({
        ...Array.from({ length: 96 }, (_, index) => index * 0.5)
          .filter((i) => i)
          .reduce((acc, i) => ({ ...acc, [i]: `${i / (baseFontSize / 4)}rem` }), {}),
      }),

      animation: {
        fadeIn: "fadeIn 0.25s ease-in-out",
        slideInRight: "slideInRight 0.3s ease-in-out",
      },

      // that is actual animation
      keyframes: (theme) => ({
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        slideInRight: {
          "0%": { transform: "translateX(5%)", opacity: 0 },
          "100%": { transform: "translateX(0)", opacity: 1 },
        },
      }),
    },
  },
  plugins: [],
};
