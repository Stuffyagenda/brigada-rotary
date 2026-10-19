// Configuración del service worker (Serwist, modo configurador).
// Se ejecuta con `serwist build` después de `next build`.
// TODO(sync-offline): crear app/sw.ts (fuente del SW). Mientras no exista,
// no ejecutar `serwist build`.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});
