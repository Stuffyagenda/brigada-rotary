"use client";

import { Download, Share } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** Evento no estándar de Chromium para ofrecer la instalación. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const INSTRUCCION_IOS =
  "En iPhone: abre en Safari, toca Compartir y luego 'Añadir a pantalla de inicio'.";

// El evento puede llegar antes de que el botón se monte: se captura al cargar el módulo.
let aviso: BeforeInstallPromptEvent | null = null;
let instalada = false;
const listeners = new Set<() => void>();
const notificar = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    aviso = e as BeforeInstallPromptEvent;
    notificar();
  });
  window.addEventListener("appinstalled", () => {
    aviso = null;
    instalada = true;
    notificar();
  });
}

/** `prompt`: el navegador ofrece instalar; `ios`: instrucción de Safari; `none`: nada que mostrar. */
export type ModoInstalacion = "prompt" | "ios" | "none";
type Modo = ModoInstalacion;

function esStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

function esIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac con pantalla táctil.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function modoActual(): Modo {
  if (instalada || esStandalone()) return "none";
  if (aviso) return "prompt";
  return esIOS() ? "ios" : "none";
}

function suscribir(l: () => void): () => void {
  listeners.add(l);
  const media = window.matchMedia?.("(display-mode: standalone)");
  media?.addEventListener?.("change", l);
  return () => {
    listeners.delete(l);
    media?.removeEventListener?.("change", l);
  };
}

/** Qué puede mostrar el botón de instalación ahora mismo. Reactivo. */
export function useModoInstalacion(): ModoInstalacion {
  return useSyncExternalStore(suscribir, modoActual, () => "none" as Modo);
}

export interface InstallButtonProps {
  /** `boton` (por defecto): botón secundario. `menu`: fila del menú de cuenta. */
  variante?: "boton" | "menu";
  className?: string;
}

/**
 * Botón "Instalar app" (Chrome/Android/escritorio, con `beforeinstallprompt`) o,
 * en iPhone/iPad, la instrucción para añadirla a la pantalla de inicio.
 * No muestra nada si la app ya está instalada o el navegador no lo permite.
 */
export function InstallButton({ variante = "boton", className }: InstallButtonProps) {
  const modo = useModoInstalacion();
  const enMenu = variante === "menu";

  if (modo === "ios") {
    return (
      <p
        className={cn(
          "flex items-start text-sm text-ink-soft",
          enMenu ? "gap-3 px-3 py-2.5" : "gap-2",
          className,
        )}
      >
        <Share aria-hidden className={cn("shrink-0", enMenu ? "size-5" : "mt-0.5 size-4")} />
        <span>{INSTRUCCION_IOS}</span>
      </p>
    );
  }
  if (modo !== "prompt") return null;

  const instalar = async () => {
    const evento = aviso;
    if (!evento) return;
    aviso = null;
    notificar();
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") {
      instalada = true;
      notificar();
    }
  };

  if (enMenu) {
    return (
      <button
        type="button"
        onClick={() => void instalar()}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-base transition-colors duration-140 ease-out hover:bg-ink/5",
          className,
        )}
      >
        <Download aria-hidden="true" size={20} className="text-ink-soft" />
        Instalar app
      </button>
    );
  }

  return (
    <Button variant="secondary" className={className} onClick={() => void instalar()}>
      <Download aria-hidden className="size-5" />
      Instalar app
    </Button>
  );
}
