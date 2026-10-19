"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (`/sw.js`, scope `/`) solo en producción.
 * En desarrollo no se registra, para no servir copias viejas mientras se programa.
 * No renderiza nada.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Un service worker de una sesión de producción local puede seguir
      // controlando localhost y servir chunks antiguos en desarrollo.
      void navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) => {
          if (registrations.length === 0) return;
          await Promise.all(registrations.map((registration) => registration.unregister()));
          if (navigator.serviceWorker.controller) window.location.reload();
        })
        .catch(() => {});
      return;
    }
    const registrar = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err: unknown) => {
        console.warn("No se pudo registrar el service worker:", err);
      });
    };
    // Tras la carga, para no competir con los recursos de la primera pantalla.
    if (document.readyState === "complete") registrar();
    else {
      window.addEventListener("load", registrar, { once: true });
      return () => window.removeEventListener("load", registrar);
    }
  }, []);
  return null;
}
