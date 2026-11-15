import type { Config } from 'tailwindcss';

// Tailwind v3 compilado (antes: Play CDN, que también es v3 con la configuración por defecto).
// Las clases se usan en el HTML y en las plantillas de los módulos TS (innerHTML / classList).
export default {
  content: ['./index.html', './src/**/*.ts'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
