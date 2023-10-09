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
      fontSize: {
        xs: [
          `${(16 * 0.75) / baseFontSize}rem` /* 12px */,
          {
            lineHeight: `${(16 * 1) / baseFontSize}rem` /* 16px */,
          },
        ],
        sm: [
          `${(16 * 0.875) / baseFontSize}rem` /* 14px */,
          {
            lineHeight: `${(16 * 1.25) / baseFontSize}rem` /* 20px */,
          },
        ],
        base: [
          `${(16 * 1) / baseFontSize}rem` /* 16px */,
          {
            lineHeight: `${(16 * 1.5) / baseFontSize}rem` /* 24px */,
          },
        ],
        lg: [
          `${(16 * 1.125) / baseFontSize}rem` /* 18px */,
          {
            lineHeight: `${(16 * 1.75) / baseFontSize}rem` /* 28px */,
          },
        ],
        xl: [
          `${(16 * 1.25) / baseFontSize}rem` /* 20px */,
          {
            lineHeight: `${(16 * 1.75) / baseFontSize}rem` /* 28px */,
          },
        ],
        "2xl": [
          `${(16 * 1.5) / baseFontSize}rem` /* 24px */,
          {
            ineHeight: `${(16 * 2) / baseFontSize}rem` /* 32px */,
          },
        ],
        "3xl": [
          `${(16 * 1.875) / baseFontSize}rem` /* 30px */,
          {
            lineHeight: `${(16 * 2.25) / baseFontSize}rem` /* 36px */,
          },
        ],
        "4xl": [
          `${(16 * 2.25) / baseFontSize}rem` /* 36px */,
          {
            lineHeight: `${(16 * 2.5) / baseFontSize}rem` /* 40px */,
          },
        ],
        "5xl": [
          `${(16 * 3) / baseFontSize}rem` /* 48px */,
          {
            lineHeight: (16 * 1) / baseFontSize,
          },
        ],
        "6xl": [
          `${(16 * 3.75) / baseFontSize}rem` /* 60px */,
          {
            lineHeight: (16 * 1) / baseFontSize,
          },
        ],
        "7xl": [
          `${(16 * 4.5) / baseFontSize}rem` /* 72px */,
          {
            lineHeight: (16 * 1) / baseFontSize,
          },
        ],
        "8xl": [
          `${(16 * 6) / baseFontSize}rem` /* 96px */,
          {
            lineHeight: (16 * 1) / baseFontSize,
          },
        ],
        "9xl": [
          `${(16 * 8) / baseFontSize}rem` /* 128px */,
          {
            lineHeight: (16 * 1) / baseFontSize,
          },
        ],
      },
    },
  },
  plugins: [],
};
