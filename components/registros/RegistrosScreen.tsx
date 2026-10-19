"use client";

/**
 * Lista de reportes guardados en este celular: filas planas con divisor,
 * búsqueda local, filtro rápido por vigencia y accesos a la ficha ("Ver en
 * mapa") y a la edición. La vigencia se recalcula con `useAhora()`.
 */
import { CloudCheck, CloudOff, Map as MapIcon, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { GlifoVigencia } from "@/components/map/GlifoVigencia";
import { alternar, contarPorVigencia } from "@/components/map/url-state";
import { formatoTelefono, haceCuanto, fechaLarga, plusCodeDe, tituloReporte } from "@/components/sheet/format";
import { SyncIndicator } from "@/components/sync/SyncIndicator";
import { Chip } from "@/components/ui/Chip";
import { useAhora } from "@/hooks/useAhora";
import { useReportes } from "@/hooks/useReportes";
import type { ReporteLocal } from "@/lib/db";
import { cn } from "@/lib/cn";
import type { Vigencia } from "@/lib/types";
import {
  formatearFechaLarga,
  vigencia as vigenciaDe,
  VIGENCIA_DESCRIPCION,
  VIGENCIA_LABEL,
  VIGENCIAS,
} from "@/lib/vigencia";
import { buscarRegistros, textoVigencia } from "./buscar";

const accion =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3.5 font-semibold " +
  "transition-[scale,border-color] duration-140 ease-out motion-safe:active:scale-[0.97] hover:border-ink-soft";

export function RegistrosScreen() {
  const idBuscar = useId();
  const [consulta, setConsulta] = useState("");
  const q = useDeferredValue(consulta);
  const [filtroVigencia, setFiltroVigencia] = useState<Vigencia[]>([]);
  const ahora = useAhora();
  const { reportes, loading } = useReportes();
  const encontrados = useMemo(() => buscarRegistros(reportes, q, ahora), [reportes, q, ahora]);
  const conteo = useMemo(() => contarPorVigencia(encontrados, ahora), [encontrados, ahora]);
  const lista = useMemo(
    () =>
      filtroVigencia.length
        ? encontrados.filter((r) => filtroVigencia.includes(vigenciaDe(r, ahora)))
        : encontrados,
    [encontrados, filtroVigencia, ahora],
  );
  const sinEnviar = reportes.filter((r) => r._sync !== "synced").length;
  const filtrando = q.trim() !== "" || filtroVigencia.length > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-paper">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-line bg-paper/95 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 font-semibold text-rotary hover:bg-ink/5">
            <MapIcon aria-hidden="true" className="size-5" />
            Mapa
          </Link>
          <div data-slot="sync-account" className="ml-auto flex h-11 items-center justify-end gap-1">
            <SyncIndicator />
            <AccountMenu />
          </div>
        </div>
        <div>
          <h1 className="text-xl font-bold">Registros</h1>
          {!loading && (
            <p className="text-ink-soft">
              {reportes.length === 1 ? "1 reporte en este celular" : `${reportes.length} reportes en este celular`}
              {sinEnviar > 0 && <span className="block">{sinEnviar === 1 ? "1 sin enviar" : `${sinEnviar} sin enviar`}</span>}
            </p>
          )}
        </div>
        <div className="relative">
          <label htmlFor={idBuscar} className="sr-only">
            Buscar por nombre, teléfono, brigadista, Plus Code o id
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-soft" />
          <input
            id={idBuscar}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Nombre, teléfono o Plus Code"
            className="h-12 w-full rounded-xl border border-line bg-white pr-3 pl-11 text-base placeholder:text-ink-soft focus-visible:border-ink"
          />
        </div>
        {!loading && reportes.length > 0 && (
          <div
            role="group"
            aria-label="Filtrar por vigencia de la atención"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {VIGENCIAS.map((v) => (
              <Chip
                key={v}
                pressed={filtroVigencia.includes(v)}
                onPressedChange={() => setFiltroVigencia((f) => alternar(f, v))}
                title={VIGENCIA_DESCRIPCION[v]}
                className="shrink-0 gap-2 pr-3 pl-2.5"
              >
                <GlifoVigencia vigencia={v} />
                <span>
                  {VIGENCIA_LABEL[v]}
                  {v !== "pendiente" && <span className="sr-only">: {VIGENCIA_DESCRIPCION[v]}</span>}
                </span>
                <span className="font-stamp text-lg leading-none">{conteo[v]}</span>
              </Chip>
            ))}
          </div>
        )}
      </header>

      <main id="contenido" className="flex-1 px-4 pb-10 sm:px-6">
        {loading ? null : reportes.length === 0 ? (
          <div className="py-10">
            <p className="text-lg font-bold">Todavía no hay reportes en este celular.</p>
            <p className="text-ink-soft">Con conexión, se descargan solos.</p>
          </div>
        ) : lista.length === 0 ? (
          <div className="py-10" role="status">
            {q.trim() ? (
              <>
                <p className="text-lg font-bold">Ningún reporte coincide con “{q.trim()}”.</p>
                <p className="text-ink-soft">
                  Prueba con parte del nombre, los últimos dígitos del teléfono o el Plus Code
                  {filtroVigencia.length > 0 && ", o quita el filtro de vigencia"}.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">Ningún reporte con esa vigencia.</p>
                <p className="text-ink-soft">Quita el filtro para ver todos los reportes.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {filtrando && (
              <p role="status" className="pt-4 text-sm text-ink-soft">
                {lista.length === 1 ? "1 resultado" : `${lista.length} resultados`}
              </p>
            )}
            <ul className="divide-y divide-line">
              {lista.map((r) => (
                <Fila key={r.id} reporte={r} ahora={ahora} />
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

function Fila({ reporte: r, ahora }: { reporte: ReporteLocal; ahora: Date }) {
  const telefono = formatoTelefono(r.contacto_telefono);
  const plusCode = plusCodeDe(r);
  const actualizado = haceCuanto(r.updated_at, ahora);
  const sincronizado = r._sync === "synced";
  const vig = vigenciaDe(r, ahora);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold break-words">{tituloReporte(r)}</h2>
        <p className={cn(!telefono && "text-ink-soft")}>{telefono ?? "Sin teléfono"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold" data-testid="fila-vigencia">
            <GlifoVigencia vigencia={vig} tamano="sm" />
            <span>
              {textoVigencia(r, ahora)}
              {vig === "vencido" && <span className="font-normal">, necesita nueva visita</span>}
            </span>
          </span>
          <span className={cn("inline-flex items-center gap-1.5", sincronizado ? "text-ink-soft" : "font-semibold")}>
            {sincronizado ? (
              <CloudCheck aria-hidden="true" className="size-4" />
            ) : (
              <CloudOff aria-hidden="true" className="size-4" />
            )}
            {sincronizado ? "Sincronizado" : r._sync === "error" ? "No se pudo enviar" : "Sin enviar"}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {r.fecha_reporte && (
            <span className="block">
              Reporte del <time dateTime={r.fecha_reporte}>{formatearFechaLarga(r.fecha_reporte)}</time>
            </span>
          )}
          {plusCode && <span className="block">Plus Code {plusCode}</span>}
          {actualizado && (
            <span className="block">
              Actualizado{" "}
              <time dateTime={r.updated_at} title={fechaLarga(r.updated_at) ?? undefined}>
                {actualizado}
              </time>
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href={`/?reporte=${encodeURIComponent(r.id)}`} className={accion}>
          <MapIcon aria-hidden="true" className="size-4" />
          Ver en mapa
        </Link>
        <Link href={`/?reporte=${encodeURIComponent(r.id)}&editar=1`} className={accion}>
          <Pencil aria-hidden="true" className="size-4" />
          Editar
        </Link>
      </div>
    </li>
  );
}
