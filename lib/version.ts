/**
 * Versión de la app (la de `package.json`), inyectada en el build por
 * `next.config.ts` como `NEXT_PUBLIC_APP_VERSION`.
 */
export const APP_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
