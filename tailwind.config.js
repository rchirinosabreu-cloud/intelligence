/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: "#E7DCF0",
        surface: "#F5F1FA",
        accent: "#366882",
        ink: "#352C32",
      },
      boxShadow: {
        chat: "0 24px 60px rgba(53, 44, 50, 0.12)",
      },
      borderRadius: {
        xl: "24px",
      },
    },
  },
  plugins: [],
};
