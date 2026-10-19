/**
 * Glifo de vigencia: la misma forma y color que el pin del mapa (ver glifo.css).
 * Es decorativo: el texto que lo acompaña dice el estado.
 */
import { cn } from "@/lib/cn";
import type { Vigencia } from "@/lib/types";
import "./glifo.css";

export interface GlifoVigenciaProps {
  vigencia: Vigencia;
  /** `sm` 12 px (texto pequeño), `md` 14 px (por defecto), `lg` 18 px. */
  tamano?: "sm" | "md" | "lg";
  className?: string;
}

export function GlifoVigencia({ vigencia, tamano = "md", className }: GlifoVigenciaProps) {
  return (
    <span
      aria-hidden="true"
      data-vigencia={vigencia}
      data-tamano={tamano}
      data-testid={`glifo-${vigencia}`}
      className={cn("glifo", className)}
    />
  );
}
