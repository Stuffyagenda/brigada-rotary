"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Estado } from "@/lib/types";

/** Muescas del borde perforado de la ficha (semicírculos del color de la cabecera). */
const PERFORADO = {
  backgroundImage: "radial-gradient(circle at 100% 50%, var(--color-white) 3px, transparent 3.5px)",
  backgroundSize: "8px 11px",
  backgroundRepeat: "repeat-y",
} as const;

/** 220 ms --ease-out; con movimiento reducido el CSS global deja solo la opacidad. */
const FUNDIDO = "transition-[opacity,filter] duration-220 ease-out";
const VISIBLE = "opacity-100 blur-[0px]";
const OCULTO = "opacity-0 blur-[2px] motion-reduce:blur-[0px]";

const SELLO: Record<Estado, { texto: string; fondo: string }> = {
  PENDIENTE: { texto: "Pendiente", fondo: "bg-pending" },
  ATENDIDO: { texto: "Atendido", fondo: "bg-done" },
};

/**
 * Cabecera del formulario con la franja de estado de la ficha de triaje.
 *
 * El momento orquestado (plan § 3): al pasar a ATENDIDO la franja cambia de
 * rojo a verde con un fundido cruzado (opacidad + blur 2px, 220 ms --ease-out).
 * Las dos capas están siempre montadas, así que el cambio es interrumpible.
 * Movimiento reducido: el CSS global solo deja transicionar la opacidad.
 */
export function StatusHeader({
  estado,
  titulo,
  subtitulo,
  sello,
  onClose,
}: {
  estado: Estado;
  titulo: string;
  subtitulo?: string;
  /**
   * Texto del sello en lugar del estado (p. ej. "Nueva visita" sobre la franja
   * verde). Se anuncia al lector de pantalla en lugar de "Estado: …".
   */
  sello?: string;
  onClose: () => void;
}) {
  const textoDe = (e: Estado) => (sello && e === estado ? sello : SELLO[e].texto);
  return (
    <header className="flex shrink-0 items-stretch border-b border-line bg-white">
      <div className="relative w-28 shrink-0 overflow-hidden" data-testid="franja-estado" data-estado={estado}>
        {/* Capa base (roja, siempre opaca): solo su sello se desvanece. */}
        <div aria-hidden="true" className={cn("absolute inset-0 flex items-center justify-center pr-2", SELLO.PENDIENTE.fondo)}>
          <span
            data-activo={estado === "PENDIENTE"}
            className={cn(
              "text-center font-stamp text-lg uppercase leading-none text-white",
              FUNDIDO,
              estado === "PENDIENTE" ? VISIBLE : OCULTO,
            )}
          >
            {textoDe("PENDIENTE")}
          </span>
        </div>
        {/* Capa verde encima: aparece con opacidad + blur sobre la roja (sin mezcla lavada a mitad). */}
        <div
          aria-hidden="true"
          data-activo={estado === "ATENDIDO"}
          className={cn(
            "absolute inset-0 flex items-center justify-center pr-2",
            SELLO.ATENDIDO.fondo,
            FUNDIDO,
            estado === "ATENDIDO" ? VISIBLE : OCULTO,
          )}
        >
          <span className="text-center font-stamp text-lg uppercase leading-none text-white">
            {textoDe("ATENDIDO")}
          </span>
        </div>
        <span aria-hidden="true" className="absolute inset-y-0 right-0 w-2" style={PERFORADO} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center py-2.5 pr-1 pl-3">
        <h2 className="truncate text-lg font-bold leading-tight text-ink">{titulo}</h2>
        {subtitulo && <p className="truncate text-sm text-ink-soft">{subtitulo}</p>}
        <p className="sr-only">{sello ?? `Estado: ${SELLO[estado].texto}`}</p>
      </div>
      <div className="flex items-center pr-2">
        <Button variant="ghost" size="icon" aria-label="Cerrar formulario" onClick={onClose}>
          <X aria-hidden="true" className="size-6" />
        </Button>
      </div>
    </header>
  );
}
