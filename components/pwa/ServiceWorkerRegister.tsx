"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (`/sw.js`, scope `/`) solo en producción.
 * En desarrollo no se registra, para no servir copias viejas mientras se programa.
 * No renderiza nada.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
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
