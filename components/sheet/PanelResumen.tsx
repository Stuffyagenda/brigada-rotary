"use client";

/**
 * Resumen del panel: "N pendientes en esta zona" (lo que se ve con el panel
 * asomado), "N familias necesitan nueva visita" si hay atendidos hace 7 días o
 * más y, debajo, las listas de la zona: pendientes por prioridad y familias por
 * revisitar. Las listas son también la alternativa accesible a tocar los pines.
 */
import { List, MapPin, Plus, X } from "lucide-react";
import Link from "next/link";
import { GlifoVigencia } from "@/components/map/GlifoVigencia";
import { Button } from "@/components/ui/Button";
import type { ReporteLocal } from "@/lib/db";
import { encodePlusCode, type LatLng } from "@/lib/pluscode";
import { PRIORIDADES } from "@/lib/types";
import { diasDesdeAtencion, textoAtendidoHace, vigencia as vigenciaDe } from "@/lib/vigencia";
import { listaNecesidades, tituloReporte } from "./format";

const PRIORIDAD_TEXTO = { ALTA: "Prioridad alta", MEDIA: "Prioridad media", BAJA: "Prioridad baja" } as const;
const MAX_FILAS = 40;

/** Pendientes ordenados por prioridad (alta primero) y, a igual prioridad, el más reciente primero. */
export function ordenarPendientes(reportes: readonly ReporteLocal[]): ReporteLocal[] {
  return reportes
    .filter((r) => r.estado === "PENDIENTE")
    .sort(
      (a, b) =>
        PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad) ||
        b.updated_at.localeCompare(a.updated_at),
    );
}

/** Atendidos hace 7 días o más, del que lleva más tiempo sin visita al que menos. */
export function ordenarVencidos(reportes: readonly ReporteLocal[], ahora: Date = new Date()): ReporteLocal[] {
  return reportes
    .map((r) => ({ r, dias: diasDesdeAtencion(r, ahora) }))
    .filter(({ r }) => vigenciaDe(r, ahora) === "vencido")
    .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity))
    .map(({ r }) => r);
}

/** "1 familia necesita nueva visita", "3 familias necesitan nueva visita". */
export function textoNecesitanVisita(n: number): string {
  return n === 1 ? "1 familia necesita nueva visita" : `${n} familias necesitan nueva visita`;
}

export interface PanelResumenProps {
  /** Reportes visibles (filtrados) dentro del área del mapa. */
  enZona: readonly ReporteLocal[];
  /** Hay algún reporte en el celular. */
  hayReportes: boolean;
  loading: boolean;
  hayFiltros: boolean;
  /** Referencia de la vigencia (la de `useAhora()`). */
  ahora: Date;
  ubicacion: LatLng | null;
  onAbrir: (id: string) => void;
  onRegistrarAqui: () => void;
  onQuitarUbicacion: () => void;
  /** Muestra el enlace a /registros (en escritorio ya está en la cabecera). */
  mostrarEnlaceLista?: boolean;
}

export function PanelResumen({
  enZona,
  hayReportes,
  loading,
  hayFiltros,
  ahora,
  ubicacion,
  onAbrir,
  onRegistrarAqui,
  onQuitarUbicacion,
  mostrarEnlaceLista = true,
}: PanelResumenProps) {
  const pendientes = ordenarPendientes(enZona);
  const vencidos = ordenarVencidos(enZona, ahora);
  const atendidos = enZona.length - pendientes.length;

  return (
    <div className="flex flex-col gap-5">
      {ubicacion && (
        <section
          aria-label="Ubicación elegida"
          className="flex flex-col gap-3 rounded-xl border border-rotary/30 bg-white p-3"
        >
          <div className="flex items-start gap-3">
            <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rotary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Ubicación elegida</p>
              <p className="text-ink-soft">{encodePlusCode(ubicacion.lat, ubicacion.lng)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onQuitarUbicacion} aria-label="Quitar ubicación elegida" className="-mt-2 -mr-2">
              <X aria-hidden="true" className="size-5" />
            </Button>
          </div>
          <Button block onClick={onRegistrarAqui}>
            <Plus aria-hidden="true" className="size-5" />
            Registrar familia aquí
          </Button>
        </section>
      )}

      <div aria-live={!loading && hayReportes ? "polite" : undefined} className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          {loading ? (
            <p className="py-2 text-ink-soft">Leyendo los reportes guardados en este celular</p>
          ) : !hayReportes ? (
            <div>
              <p className="text-lg font-bold">Todavía no hay reportes en este celular</p>
              <p className="text-ink-soft">Con conexión, se descargan solos.</p>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="flex items-baseline gap-2">
                <span className="font-stamp text-2xl text-pending">{pendientes.length}</span>
                <span className="text-lg font-bold">{pendientes.length === 1 ? "pendiente" : "pendientes"}</span>
              </p>
              <p className="text-ink-soft">
                en esta zona, {atendidos === 1 ? "1 atendido" : `${atendidos} atendidos`}
                {hayFiltros && <span className="block">con los filtros activos</span>}
              </p>
            </div>
          )}
          {mostrarEnlaceLista && (
            <Link
              href="/registros"
              className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 font-semibold text-rotary hover:bg-ink/5"
            >
              <List aria-hidden="true" className="size-5" />
              Registros
            </Link>
          )}
        </div>
        {/* Atendidos hace 7 días o más: a la vista con el panel asomado, a todo el ancho. */}
        {!loading && vencidos.length > 0 && (
          <p className="flex items-center gap-2 font-bold" data-testid="necesitan-visita">
            <GlifoVigencia vigencia="vencido" />
            {textoNecesitanVisita(vencidos.length)}
          </p>
        )}
      </div>

      {!loading && hayReportes && (
        <section aria-labelledby="titulo-pendientes-zona">
          <h2 id="titulo-pendientes-zona" className="text-sm font-semibold text-ink-soft">
            Pendientes en esta zona, por prioridad
          </h2>
          {pendientes.length === 0 ? (
            <p className="mt-2 text-ink-soft">
              No hay pendientes aquí. Mueve el mapa{hayFiltros ? " o quita filtros" : ""} para ver otra zona.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-line border-y border-line">
              {pendientes.slice(0, MAX_FILAS).map((r) => {
                const nec = listaNecesidades(r);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onAbrir(r.id)}
                      className="flex min-h-14 w-full items-start gap-3 py-3 text-left hover:bg-ink/[0.03]"
                    >
                      <GlifoVigencia vigencia="pendiente" className="mt-1.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words">{tituloReporte(r)}</span>
                        <span className="block text-sm text-ink-soft">
                          {PRIORIDAD_TEXTO[r.prioridad]}
                          {nec.length > 0 && <span className="block">Necesita {nec.join(", ").toLocaleLowerCase("es")}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {pendientes.length > MAX_FILAS && (
            <p className="mt-2 text-sm text-ink-soft">
              Se muestran {MAX_FILAS} de {pendientes.length}. Acerca el mapa para ver el resto.
            </p>
          )}
        </section>
      )}

      {!loading && vencidos.length > 0 && (
        <section aria-labelledby="titulo-vencidos-zona">
          <h2 id="titulo-vencidos-zona" className="text-sm font-semibold text-ink-soft">
            Necesitan nueva visita, la más antigua primero
          </h2>
          <ul className="mt-1 divide-y divide-line border-y border-line">
            {vencidos.slice(0, MAX_FILAS).map((r) => {
              const dias = diasDesdeAtencion(r, ahora);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onAbrir(r.id)}
                    className="flex min-h-14 w-full items-start gap-3 py-3 text-left hover:bg-ink/[0.03]"
                  >
                    <GlifoVigencia vigencia="vencido" className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold break-words">{tituloReporte(r)}</span>
                      {dias !== null && <span className="block text-sm text-ink-soft">{textoAtendidoHace(dias)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {vencidos.length > MAX_FILAS && (
            <p className="mt-2 text-sm text-ink-soft">
              Se muestran {MAX_FILAS} de {vencidos.length}. Acerca el mapa para ver el resto.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
