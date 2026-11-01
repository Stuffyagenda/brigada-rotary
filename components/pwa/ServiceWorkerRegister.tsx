"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** Cada cuánto se busca una versión nueva con la app abierta. */
export const INTERVALO_ACTUALIZACION_MS = 60 * 60 * 1000;

/** Aviso cuando el service worker de una versión nueva toma el control. */
export const MSG_VERSION_NUEVA = "Hay una versión nueva de la app.";

/**
 * Registra el service worker (`/sw.js`, scope `/`) solo en producción.
 * En desarrollo no se registra, para no servir copias viejas mientras se programa.
 *
 * Con la app abierta (en campo puede quedarse así días) busca una versión nueva
 * al volver a la app y cada hora. Cuando el SW nuevo toma el control
 * (`skipWaiting` + `clientsClaim` en app/sw.ts), avisa con "Actualizar": no
 * recarga solo, para no perder un formulario a medio llenar.
 * No renderiza nada.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (process.env.NODE_ENV !== "production") {
      // Un service worker de una sesión de producción local puede seguir
      // controlando localhost y servir chunks antiguos en desarrollo.
      void sw
        .getRegistrations()
        .then(async (registrations) => {
          if (registrations.length === 0) return;
          await Promise.all(registrations.map((registration) => registration.unregister()));
          if (sw.controller) window.location.reload();
        })
        .catch(() => {});
      return;
    }

    // Sin controller al cargar es la primera instalación: no hay versión anterior.
    const habiaControlador = Boolean(sw.controller);
    let registro: ServiceWorkerRegistration | null = null;
    const buscarVersion = () => {
      void registro?.update().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") buscarVersion();
    };
    const onControllerChange = () => {
      if (!habiaControlador) return;
      toast(MSG_VERSION_NUEVA, {
        id: "version-nueva",
        duration: Infinity,
        action: { label: "Actualizar", onClick: () => window.location.reload() },
      });
    };
    const registrar = () => {
      sw.register("/sw.js", { scope: "/" })
        .then((r) => {
          registro = r;
        })
        .catch((err: unknown) => {
          console.warn("No se pudo registrar el service worker:", err);
        });
    };

    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    const intervalo = window.setInterval(buscarVersion, INTERVALO_ACTUALIZACION_MS);
    // Tras la carga, para no competir con los recursos de la primera pantalla.
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });

    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalo);
      window.removeEventListener("load", registrar);
    };
  }, []);
  return null;
}
