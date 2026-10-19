import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Ignorados por defecto de eslint-config-next
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Archivos fuera de la app Next
    "index.html",
    "sw.js",
    "supabase/**",
    ".claude/**",
    // Service worker generado
    "public/sw*.js",
    "public/swe-worker*.js",
    // Salidas de tests
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
