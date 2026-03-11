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
        bg: "hsl(0, 0%, 3.5%)",
        card: "hsl(0, 0%, 6%)",
        elevated: "hsl(0, 0%, 8%)",
        secondary: "hsl(0, 0%, 12%)",
        muted: "hsl(0, 0%, 15%)",
        border: "hsl(0, 0%, 18%)",
        gold: "hsl(45, 100%, 60%)",
        "gold-muted": "hsl(45, 60%, 45%)",
        "text-tertiary": "hsl(0, 0%, 50%)",
        "text-secondary": "hsl(0, 0%, 70%)",
      },
      fontSize: {
        body: "1rem",
        title: "1.875rem",
      },
      fontFamily: {
        outfit: ["Outfit", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 60px hsl(45, 100%, 60%, 0.15)",
        card: "0 4px 24px hsl(0, 0%, 0%, 0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
