"use client";

/** Controles flotantes del mapa: Mi ubicación, Elegir en el mapa, capa y zoom (escritorio). */
import { Crosshair, Layers, LocateFixed, Minus, Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import type { Capa } from "./BrigadaMap";

function BotonMapa({ className, pressed, ...props }: ComponentProps<"button"> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "grid size-11 place-items-center rounded-full border text-ink",
        "shadow-[0_1px_2px_rgb(28_39_51/0.2),0_2px_8px_rgb(28_39_51/0.12)]",
        "transition-[scale,background-color,border-color] duration-140 ease-out motion-safe:active:scale-[0.97]",
        pressed ? "border-gold bg-gold" : "border-line bg-white hover:border-ink-soft",
        "disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export interface MapControlsProps {
  localizando: boolean;
  onMiUbicacion: () => void;
  eligiendo: boolean;
  onElegir: () => void;
  capa: Capa;
  onCapa: (capa: Capa) => void;
  /** Botones + y − (solo escritorio). */
  onZoom?: (delta: 1 | -1) => void;
  className?: string;
}

export function MapControls({
  localizando,
  onMiUbicacion,
  eligiendo,
  onElegir,
  capa,
  onCapa,
  onZoom,
  className,
}: MapControlsProps) {
  return (
    <div role="toolbar" aria-label="Controles del mapa" aria-orientation="vertical" className={cn("flex flex-col gap-2", className)}>
      <BotonMapa
        onClick={onMiUbicacion}
        disabled={localizando}
        aria-busy={localizando}
        aria-label={localizando ? "Buscando tu ubicación" : "Mi ubicación"}
        title="Mi ubicación"
      >
        <LocateFixed aria-hidden="true" className="size-5" />
      </BotonMapa>
      <BotonMapa onClick={onElegir} pressed={eligiendo} aria-label="Elegir en el mapa" title="Elegir en el mapa">
        <Crosshair aria-hidden="true" className="size-5" />
      </BotonMapa>
      <BotonMapa
        onClick={() => onCapa(capa === "satelite" ? "calles" : "satelite")}
        pressed={capa === "satelite"}
        aria-label="Vista satélite"
        title={capa === "satelite" ? "Volver a calles" : "Vista satélite"}
      >
        <Layers aria-hidden="true" className="size-5" />
      </BotonMapa>
      {onZoom && (
        <div className="mt-2 flex flex-col gap-2">
          <BotonMapa onClick={() => onZoom(1)} aria-label="Acercar" title="Acercar">
            <Plus aria-hidden="true" className="size-5" />
          </BotonMapa>
          <BotonMapa onClick={() => onZoom(-1)} aria-label="Alejar" title="Alejar">
            <Minus aria-hidden="true" className="size-5" />
          </BotonMapa>
        </div>
      )}
    </div>
  );
}
