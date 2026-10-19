// Configuración del service worker (Serwist, modo configurador).
// `npm run build` ejecuta `serwist build serwist.config.mjs` después de `next build`:
// compila app/sw.ts y genera public/sw.js con la lista de precache del build.
import { generateGlobPatterns, serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Patrones por defecto (estáticos de Next y public/) más las fuentes de
  // next/font, para que el texto se vea bien sin conexión desde la primera visita.
  globPatterns: [...generateGlobPatterns(".next/"), ".next/static/media/**/*.{woff,woff2}"],
  // Las páginas usan sesión (cookies): no se precachea HTML prerenderado, que
  // ganaría a la red (cache-first) y podría quedar desactualizado o ser de otra sesión.
  // Las navegaciones se cachean en tiempo de ejecución (NetworkFirst, app/sw.ts).
  precachePrerendered: false,
});
