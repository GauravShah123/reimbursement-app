import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        blueprint: {
          blue: "#1a56db",
          dark: "#1e3a5f",
          light: "#eff6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
