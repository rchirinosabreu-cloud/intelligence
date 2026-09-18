import tailwindcssAnimate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

const brainBlue = {
  50: '#E6F7FA', 100: '#CCEFF4', 200: '#99DFE9', 300: '#66CFDE', 400: '#33BFD3',
  500: '#00AEC8', 600: '#009EB9', 700: '#00859C', 800: '#006B7E', 900: '#005261', 950: '#003841'
};

const brainGreen = {
  50: '#E6F7F3', 100: '#CCEFE7', 200: '#99DFD0', 300: '#66CEB8', 400: '#33BEA1',
  500: '#16B394', 600: '#00AC8A', 700: '#008A6F', 800: '#006753', 900: '#004537', 950: '#002B22'
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
    './index.html',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        indigo: brainBlue,
        violet: brainBlue,
        purple: brainGreen,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brainstudio brand colors - Updated
        brand: {
          white: '#FFFFFF',
          lavender: '#E7DCF0',
          mauve: '#F3F0F5',
          teal: '#366882',
          charcoal: '#4F4C73',
          purple: {
             DEFAULT: '#009EB9',
             deep: '#00859C',
             light: '#66CFDE'
          },
          gray: {
             bg: '#F3F3F3',
             text: '#1F2937'
          },
          // Official Brain palette (2026). DEFAULT reads the CSS token so opacity utilities work
          // (bg-brand-cyan/10); `deep` is the AA text tone on light surfaces; `soft` is a tint.
          cyan: { DEFAULT: 'rgb(var(--brand-cyan) / <alpha-value>)', deep: '#007A96', soft: '#E6F5F9' },
          green: { DEFAULT: 'rgb(var(--brand-green) / <alpha-value>)', deep: '#1F7F66', soft: '#EAF6F2' },
          magenta: { DEFAULT: 'rgb(var(--brand-magenta) / <alpha-value>)', deep: '#8A0E73', soft: '#F8E7F4' },
          coral: { DEFAULT: 'rgb(var(--brand-coral) / <alpha-value>)', deep: '#D9433F', soft: '#FFEDEC' },
          yellow: { DEFAULT: 'rgb(var(--brand-yellow) / <alpha-value>)', deep: '#8A6D00', soft: '#FFF8D6' }
        },
        // Semantic status tones for traffic lights and health signals. Red stays on `destructive`.
        status: {
          positive: { DEFAULT: 'rgb(var(--status-positive) / <alpha-value>)', fg: 'rgb(var(--status-positive-fg) / <alpha-value>)' },
          attention: { DEFAULT: 'rgb(var(--status-attention) / <alpha-value>)', fg: 'rgb(var(--status-attention-fg) / <alpha-value>)' }
        }
      },
      backgroundImage: {
        'brand-primary': 'linear-gradient(135deg, rgb(var(--brand-cyan)), rgb(var(--brand-green)))',
        'brand-energy': 'linear-gradient(135deg, rgb(var(--brand-magenta)), rgb(var(--brand-coral)))',
        'brand-sunrise': 'linear-gradient(135deg, rgb(var(--brand-coral)), rgb(var(--brand-yellow)))',
        'brand-spectrum': 'linear-gradient(120deg, rgb(var(--brand-cyan)) 0%, rgb(var(--brand-green)) 45%, rgb(var(--brand-yellow)) 100%)'
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
}
