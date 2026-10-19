"use client";

/**
 * Panel inferior del móvil (Vaul) con tres posiciones:
 * asomado (resumen), media (ficha) y completa (formulario).
 * No es modal: el mapa sigue siendo usable con el panel abierto y Tab entra y
 * sale del panel siguiendo el orden de la página.
 */
// Dependencia de vaul (misma instancia, hoisted). Se usa para que el contenido sea
// un diálogo NO modal: vaul 1.1 no pasa `modal` a Radix, que por defecto oculta el
// resto de la página a los lectores de pantalla (aria-hidden) y atrapa el foco.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/cn";
import "./sheet.css";

/** Alto del panel asomado (px). */
export const ALTO_ASOMADO = 156;

export const SNAP = {
  asomado: `${ALTO_ASOMADO}px`,
  media: 0.62,
  completa: 1,
} as const;

export type SnapPanel = (typeof SNAP)[keyof typeof SNAP];

const SNAP_POINTS: SnapPanel[] = [SNAP.asomado, SNAP.media, SNAP.completa];

/** Alto (px) que tapa el panel en cada posición, para encuadrar el mapa. */
export function altoPanel(snap: SnapPanel, altoVentana: number): number {
  if (typeof snap === "string") return parseInt(snap, 10);
  return Math.round(snap * altoVentana);
}

export interface MobileSheetProps {
  snap: SnapPanel;
  onSnapChange: (snap: SnapPanel) => void;
  /** Título para lectores de pantalla. */
  titulo: string;
  /** Escape: cierra la ficha o el modo actual. */
  onEscape: () => void;
  /** Cambia con la vista (re-monta el contenido para el fundido con movimiento reducido). */
  vistaKey: string;
  /** Barra de acciones fija al pie de la parte visible (oculta con el panel asomado). */
  pie?: ReactNode;
  /**
   * El contenido ocupa todo el alto visible y gestiona su propio scroll, márgenes
   * y barra al pie (el formulario): sin padding ni scroll del panel, así la barra
   * "Guardar reporte" queda pegada al borde inferior y nada pasa por debajo.
   */
  contenidoPropio?: boolean;
  children: ReactNode;
}

/**
 * Radix Dialog monta un FocusScope con `loop` fijo aunque el diálogo no sea
 * modal: Tab en el último elemento (o Mayús+Tab en el primero) vuelve al otro
 * extremo del panel y no deja llegar al buscador, los controles del mapa,
 * "Registrar familia", la sincronización ni el menú de cuenta. Se corta el
 * evento antes de que llegue al FocusScope (en Drawer.Content) para que el
 * navegador mueva el foco con normalidad.
 */
function dejarSalirConTab(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key === "Tab") e.stopPropagation();
}

/** Alto del asa (margen incluido). */
const ALTO_ASA = 21;

/**
 * Alto de la parte visible del panel bajo el asa. Vaul solo desplaza el panel,
 * así que el contenido se ajusta a lo visible para que el pie quede a la vista.
 */
function altoVisible(snap: SnapPanel): string | undefined {
  if (snap === SNAP.completa) return undefined;
  if (typeof snap === "string") return `${parseInt(snap, 10) - ALTO_ASA}px`;
  return `calc(${snap * 100}dvh - ${ALTO_ASA}px)`;
}

export function MobileSheet({
  snap,
  onSnapChange,
  titulo,
  onEscape,
  vistaKey,
  pie,
  contenidoPropio = false,
  children,
}: MobileSheetProps) {
  // Última interacción con teclado (Tab) o con puntero.
  const conTeclado = useRef(false);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Tab") conTeclado.current = true;
    };
    const puntero = () => {
      conTeclado.current = false;
    };
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("pointerdown", puntero, true);
    return () => {
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("pointerdown", puntero, true);
    };
  }, []);

  return (
    <Drawer.Root
      open
      defaultOpen
      modal={false}
      dismissible={false}
      noBodyStyles
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={(s) => {
        if (s != null) onSnapChange(s as SnapPanel);
      }}
    >
      {/* Raíz Radix no modal más cercana: Drawer.Content toma de aquí `modal: false`. */}
      <DialogPrimitive.Root open modal={false}>
        <Drawer.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            onEscape();
          }}
          onFocusCapture={(e) => {
            // Al llegar con Tab, el contenido oculto bajo el borde sube a la vista.
            if (snap === SNAP.asomado && conTeclado.current && e.target !== e.currentTarget) {
              onSnapChange(SNAP.media);
            }
          }}
          className={cn(
            "sheet-drawer",
            "fixed inset-x-0 bottom-0 z-30 flex h-dvh flex-col rounded-t-2xl bg-paper outline-none",
          )}
        >
          <Drawer.Handle
            aria-hidden="true"
            className="mt-2.5 mb-1.5 shrink-0 h-[5px]! w-10! bg-line! opacity-100!"
          />
          <Drawer.Title className="sr-only">{titulo}</Drawer.Title>
          <div
            data-snap={typeof snap === "string" ? "asomado" : snap === SNAP.media ? "media" : "completa"}
            style={{ height: altoVisible(snap) }}
            className={cn("flex min-h-0 flex-col", snap === SNAP.completa && "flex-1")}
            onKeyDown={dejarSalirConTab}
          >
            <div
              className={cn(
                "min-h-0 flex-1 overscroll-contain",
                contenidoPropio && "flex flex-col overflow-hidden",
                !contenidoPropio && "px-4 pt-2",
                !contenidoPropio && (pie ? "pb-6" : "pb-[calc(env(safe-area-inset-bottom)+24px)]"),
                !contenidoPropio && (snap === SNAP.completa ? "overflow-y-auto" : "overflow-hidden"),
              )}
            >
              <div key={vistaKey} className={cn("sheet-fade", contenidoPropio && "flex min-h-0 flex-1 flex-col")}>
                {children}
              </div>
            </div>
            {pie && snap !== SNAP.asomado && (
              <div className="shrink-0 border-t border-line bg-paper px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                {pie}
              </div>
            )}
          </div>
        </Drawer.Content>
      </DialogPrimitive.Root>
    </Drawer.Root>
  );
}
