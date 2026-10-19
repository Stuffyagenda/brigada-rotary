"use client";

/**
 * Filtros del mapa. Los chips de vigencia (con conteo) van siempre a la vista;
 * prioridad, necesidad y club van en el panel "Filtros". Cambiar un filtro no
 * anima nada: los pines aparecen y desaparecen al instante.
 */
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { cn } from "@/lib/cn";
import { INSUMOS, PRIORIDADES, type Vigencia } from "@/lib/types";
import { VIGENCIA_DESCRIPCION, VIGENCIA_LABEL, VIGENCIAS } from "@/lib/vigencia";
import { GlifoVigencia } from "./GlifoVigencia";
import type { ClubOpcion } from "./hooks";
import { alternar, contarFiltrosExtra, FILTROS_VACIOS, type FiltrosMapa, type NecesidadFiltro } from "./url-state";

const PRIORIDAD_CHIP = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" } as const;

function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase("es") + s.slice(1);
}

const NECESIDAD_OPCIONES: Array<{ value: NecesidadFiltro; label: string }> = [
  ...INSUMOS.map((i) => ({ value: i.clave as NecesidadFiltro, label: capitalizar(i.corto) })),
  { value: "otros", label: "Otros insumos" },
];

export interface VigenciaChipsProps {
  filtros: FiltrosMapa;
  conteo: Record<Vigencia, number>;
  onChange: (f: FiltrosMapa) => void;
  /** Chips con sombra para ir sobre el mapa (móvil). */
  flotante?: boolean;
  /** Botón "Filtros". */
  onAbrirFiltros?: () => void;
  filtrosAbiertos?: boolean;
  className?: string;
}

/**
 * Chips de vigencia "Pendientes N", "Atendidos N" (0 a 3 días), "4+ días N" y
 * "7+ días N", cada uno con el glifo del pin, y el botón "Filtros".
 * Sobre el mapa (móvil) la fila se desplaza en horizontal: "Filtros" va
 * primero para que esté siempre a mano.
 */
export function VigenciaChips({
  filtros,
  conteo,
  onChange,
  flotante = false,
  onAbrirFiltros,
  filtrosAbiertos = false,
  className,
}: VigenciaChipsProps) {
  const sombra = flotante && "shadow-[0_1px_2px_rgb(28_39_51/0.2),0_2px_8px_rgb(28_39_51/0.12)]";
  const extra = contarFiltrosExtra(filtros);
  const chip = (v: Vigencia) => (
    <Chip
      key={v}
      pressed={filtros.vigencia.includes(v)}
      onPressedChange={() => onChange({ ...filtros, vigencia: alternar(filtros.vigencia, v) })}
      title={VIGENCIA_DESCRIPCION[v]}
      className={cn("shrink-0 gap-2", flotante ? "pr-3 pl-2.5" : "pr-3.5 pl-3", sombra)}
    >
      <GlifoVigencia vigencia={v} />
      <span>
        {VIGENCIA_LABEL[v]}
        {v !== "pendiente" && <span className="sr-only">: {VIGENCIA_DESCRIPCION[v]}</span>}
      </span>
      <span className="font-stamp text-lg leading-none">{conteo[v]}</span>
    </Chip>
  );

  const botonFiltros = onAbrirFiltros && (
    <button
      type="button"
      onClick={onAbrirFiltros}
      aria-expanded={filtrosAbiertos}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 select-none items-center justify-center gap-2 rounded-full border text-base",
        // Sobre el mapa (móvil) solo el icono y el número.
        flotante ? (extra > 0 ? "px-3" : "px-0") : "px-4",
        "transition-[background-color,border-color] duration-120 ease-[ease]",
        extra > 0 || filtrosAbiertos
          ? "border-ink bg-ink font-semibold text-white"
          : "border-line bg-white text-ink hover:border-ink-soft",
        sombra,
      )}
    >
      <SlidersHorizontal aria-hidden="true" className={flotante ? "size-5" : "size-4"} />
      <span className={cn(flotante && "sr-only")}>Filtros</span>
      {extra > 0 && (
        <span className="font-stamp text-lg leading-none">
          <span className="sr-only">activos: </span>
          {extra}
        </span>
      )}
    </button>
  );

  return (
    <div className={cn("flex items-center gap-2", !flotante && "flex-wrap", className)}>
      {flotante && botonFiltros}
      <div role="group" aria-label="Filtrar por vigencia de la atención" className={cn("flex items-center gap-2", !flotante && "flex-wrap")}>
        {VIGENCIAS.map(chip)}
      </div>
      {!flotante && botonFiltros}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-ink-soft">{titulo}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export interface PanelFiltrosProps {
  filtros: FiltrosMapa;
  clubs: ClubOpcion[];
  onChange: (f: FiltrosMapa) => void;
  /** Cierra el panel (móvil). */
  onListo?: () => void;
  /** Reportes que cumplen los filtros. */
  total: number;
}

/** Prioridad, necesidad y club. Combinables; se guardan en la URL. */
export function PanelFiltros({ filtros, clubs, onChange, onListo, total }: PanelFiltrosProps) {
  const hayFiltros =
    filtros.vigencia.length + filtros.prioridad.length + filtros.necesidad.length + filtros.club.length > 0;
  return (
    <section aria-labelledby="titulo-filtros" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="titulo-filtros" className="text-lg font-bold">
            Filtros
          </h2>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {total === 1 ? "1 reporte en el mapa" : `${total} reportes en el mapa`}
          </p>
        </div>
        {hayFiltros && (
          <Button variant="ghost" onClick={() => onChange(FILTROS_VACIOS)} className="-mr-2 text-rotary">
            Quitar filtros
          </Button>
        )}
      </div>

      <Grupo titulo="Prioridad">
        {PRIORIDADES.map((p) => (
          <Chip
            key={p}
            pressed={filtros.prioridad.includes(p)}
            onPressedChange={() => onChange({ ...filtros, prioridad: alternar(filtros.prioridad, p) })}
          >
            {PRIORIDAD_CHIP[p]}
          </Chip>
        ))}
      </Grupo>

      <Grupo titulo="Necesita">
        {NECESIDAD_OPCIONES.map((n) => (
          <Chip
            key={n.value}
            pressed={filtros.necesidad.includes(n.value)}
            onPressedChange={() => onChange({ ...filtros, necesidad: alternar(filtros.necesidad, n.value) })}
          >
            {n.label}
          </Chip>
        ))}
      </Grupo>

      <Grupo titulo="Club">
        {clubs.length === 0 ? (
          <p className="text-ink-soft">Los clubes aparecen cuando hay reportes con club.</p>
        ) : (
          clubs.map((c) => (
            <Chip
              key={c.id}
              pressed={filtros.club.includes(c.id)}
              onPressedChange={() => onChange({ ...filtros, club: alternar(filtros.club, c.id) })}
            >
              {c.nombre}
            </Chip>
          ))
        )}
      </Grupo>

      {onListo && (
        <Button variant="secondary" block onClick={onListo}>
          Listo
        </Button>
      )}
    </section>
  );
}
