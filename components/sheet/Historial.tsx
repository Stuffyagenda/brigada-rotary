"use client";

/**
 * Historial de visitas en la ficha: filas planas con divisor, de la más
 * reciente a la más antigua, y la atención registrada en el reporte (ver
 * historial-entradas.ts). Sin entradas, no se muestra nada.
 */
import { CloudOff } from "lucide-react";
import { useVisitas } from "@/hooks/useVisitas";
import type { ReporteLocal } from "@/lib/db";
import { formatearFechaLarga } from "@/lib/vigencia";
import { entradasHistorial, type EntradaHistorial } from "./historial-entradas";

export function Historial({ reporte }: { reporte: ReporteLocal }) {
  const { visitas, loading } = useVisitas(reporte.id);
  if (loading) return null;
  const entradas = entradasHistorial(reporte, visitas);
  if (entradas.length === 0) return null;

  return (
    <section aria-labelledby={`historial-${reporte.id}`} className="border-t border-line pt-4">
      <h3 id={`historial-${reporte.id}`} className="text-sm font-semibold text-ink-soft">
        Visitas
      </h3>
      <ol className="mt-1 divide-y divide-line" data-testid="historial">
        {entradas.map((e) => (
          <Entrada key={e.id} entrada={e} />
        ))}
      </ol>
    </section>
  );
}

function Entrada({ entrada: e }: { entrada: EntradaHistorial }) {
  const fecha = (
    <time dateTime={e.fecha} className="font-semibold">
      {formatearFechaLarga(e.fecha)}
    </time>
  );
  return (
    <li className="flex flex-col gap-1 py-3" data-testid="historial-entrada" data-tipo={e.tipo}>
      {e.tipo === "visita" ? (
        <p>
          {fecha}
          {e.brigadista && <span className="block text-sm text-ink-soft">{e.brigadista}</span>}
        </p>
      ) : (
        <p>
          <span className="block font-semibold">{e.titulo}</span>
          <time dateTime={e.fecha} className="block text-sm text-ink-soft">
            {formatearFechaLarga(e.fecha)}
          </time>
        </p>
      )}
      {e.entregas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Entregado">
          {e.entregas.map((item) => (
            <li key={item} className="rounded-md bg-done-tint px-2 py-0.5 text-sm font-semibold text-ink">
              {item}
            </li>
          ))}
        </ul>
      )}
      {e.observaciones && <p className="whitespace-pre-line">{e.observaciones}</p>}
      {e.tipo === "visita" && e.sync !== "synced" && (
        <p className="flex items-start gap-1.5 text-sm font-semibold">
          <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {e.sync === "error" ? "No se pudo enviar. Se reintentará solo." : "Sin enviar. Se enviará cuando haya señal."}
        </p>
      )}
    </li>
  );
}
