/**
 * Hora actual que se renueva sola, para recalcular la vigencia de los reportes
 * (lib/vigencia.ts) al pasar el tiempo: cada `intervaloMs` (por defecto 10 min)
 * y al volver a la app (pestaña visible o ventana enfocada).
 */
import { useEffect, useState } from "react";

/** Intervalo por defecto de `useAhora`. */
export const INTERVALO_AHORA_MS = 10 * 60_000;

/** `Date` actual, renovada cada `intervaloMs` y al volver a la app. */
export function useAhora(intervaloMs: number = INTERVALO_AHORA_MS): Date {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const renovar = () => setAhora(new Date());
    const alVolver = () => {
      if (document.visibilityState === "visible") renovar();
    };
    const timer = window.setInterval(renovar, intervaloMs);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", renovar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", renovar);
    };
  }, [intervaloMs]);

  return ahora;
}
