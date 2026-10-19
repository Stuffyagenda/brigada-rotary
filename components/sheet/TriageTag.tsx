"use client";

import {
  Camera,
  CloudOff,
  Copy,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  PackageCheck,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useState, type ReactNode, type Ref } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { HoldToDelete } from "@/components/ui/HoldToDelete";
import type { ReporteLocal } from "@/lib/db";
import { getFotoUrl } from "@/lib/sync";
import { cn } from "@/lib/cn";
import { DANIO_VIVIENDA_LABEL, type Estado } from "@/lib/types";
import {
  desglosePersonas,
  enlaceComoLlegar,
  enlaceTel,
  enlaceWhatsApp,
  fechaLarga,
  formatoTelefono,
  haceCuanto,
  listaEntregas,
  listaNecesidades,
  plusCodeDe,
  textoMascotas,
  textoPersonas,
  urlSegura,
} from "./format";
import "./triage-tag.css";

export interface TriageTagProps {
  reporte: ReporteLocal;
  /** Nombre del club del reporte (si se conoce). */
  clubNombre?: string | null;
  onEditar: () => void;
  onRegistrarEntrega: () => void;
  /** Muestra el borrado (mantener pulsado). Solo para admin. */
  puedeBorrar?: boolean;
  /** Borra el reporte. Debe lanzar Error con un mensaje para el usuario si falla. */
  onBorrar?: () => Promise<void>;
  /**
   * El caso acaba de pasar a ATENDIDO: la ficha se monta como pendiente y
   * cambia a atendida (franja roja → verde y cambio de sello).
   */
  animarAtendido?: boolean;
  /** Ref del título (para mover el foco al abrir la ficha). */
  tituloRef?: Ref<HTMLHeadingElement>;
  /**
   * Muestra "Registrar entrega" y "Editar" dentro de la ficha. En el móvil van
   * en la barra fija del panel (`AccionesFicha`), siempre a la vista.
   */
  conAcciones?: boolean;
}

const SELLO: Record<Estado, string> = { PENDIENTE: "PENDIENTE", ATENDIDO: "ATENDIDO" };
const PRIORIDAD_CORTA = { ALTA: "Alta", MEDIA: "Media", BAJA: "Baja" } as const;

/**
 * Ficha de triaje de un reporte: el elemento memorable de la app.
 * Franja del color del estado con el sello y la prioridad, borde perforado y
 * un cuerpo sobrio con lo necesario para actuar en campo.
 */
export function TriageTag({
  reporte: r,
  clubNombre,
  onEditar,
  onRegistrarEntrega,
  puedeBorrar = false,
  onBorrar,
  animarAtendido = false,
  tituloRef,
  conAcciones = true,
}: TriageTagProps) {
  const tituloId = useId();
  // Momento "Atendido": se pinta un fotograma como pendiente y luego cambia.
  const [estadoVisible, setEstadoVisible] = useState<Estado>(animarAtendido ? "PENDIENTE" : r.estado);
  useEffect(() => {
    if (estadoVisible === r.estado) return;
    const raf = requestAnimationFrame(() => setEstadoVisible(r.estado));
    return () => cancelAnimationFrame(raf);
  }, [r.estado, estadoVisible]);

  const telefono = formatoTelefono(r.contacto_telefono);
  const tel = enlaceTel(r.contacto_telefono);
  const whatsapp = enlaceWhatsApp(r.contacto_telefono);
  const desglose = desglosePersonas(r);
  // Edades en una línea; discapacidad y casos médicos, aparte (son los que cambian la atención).
  const edades = desglose.filter((l) => ["adultos", "mayores", "menores"].includes(l.clave));
  const especiales = desglose.filter((l) => !["adultos", "mayores", "menores"].includes(l.clave));
  const mascotas = textoMascotas(r);
  const necesidades = listaNecesidades(r);
  const entregas = listaEntregas(r);
  const plusCode = plusCodeDe(r);
  const fotoHeredada = urlSegura(r.foto_url);
  const actualizado = haceCuanto(r.updated_at);
  const pendiente = r.estado === "PENDIENTE";

  const seccionNecesita = (pendiente || necesidades.length > 0) && (
    <Seccion titulo="Necesita">
      {necesidades.length > 0 ? (
        <ListaInsumos items={necesidades} tono="pending" />
      ) : (
        <p className="text-ink-soft">Sin necesidades registradas</p>
      )}
    </Seccion>
  );

  const seccionEntregado = (entregas.length > 0 || r.observaciones_atencion || !pendiente) && (
    <Seccion titulo="Entregado">
      {entregas.length > 0 ? (
        <ListaInsumos items={entregas} tono="done" />
      ) : (
        <p className="text-ink-soft">Sin entregas registradas</p>
      )}
      {r.observaciones_atencion && <p className="mt-2 whitespace-pre-line">{r.observaciones_atencion}</p>}
    </Seccion>
  );

  async function copiarPlusCode() {
    if (!plusCode) return;
    try {
      await navigator.clipboard.writeText(plusCode);
      toast("Plus Code copiado");
    } catch {
      toast.error("No se pudo copiar. Mantén pulsado el código para seleccionarlo.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <article aria-labelledby={tituloId} className="ficha-wrap">
        <div className="ficha-tag" data-estado={estadoVisible} data-testid="triage-tag">
          {/* Franja de estado */}
          <div className={cn("ficha-stripe", "flex flex-col items-center gap-4 px-1 pt-5 pb-6")}>
            <span className="ficha-glyph" aria-hidden="true" />
            <p className="text-center text-sm leading-tight font-bold">
              <span className="sr-only">Prioridad </span>
              {PRIORIDAD_CORTA[r.prioridad]}
            </p>
            <p className={cn("ficha-stamp", "font-stamp text-2xl")}>
              <span className="sr-only">Estado: </span>
              <span data-visible={estadoVisible === "PENDIENTE"} aria-hidden={estadoVisible !== "PENDIENTE"}>
                {SELLO.PENDIENTE}
              </span>
              <span data-visible={estadoVisible === "ATENDIDO"} aria-hidden={estadoVisible !== "ATENDIDO"}>
                {SELLO.ATENDIDO}
              </span>
            </p>
          </div>
          <div className="ficha-perforation" aria-hidden="true" />

          {/* Cuerpo */}
          <div className={cn("ficha-body", "flex flex-col gap-4 py-4 pr-4 pl-5")}>
            <header className="flex flex-col gap-1">
              <h2
                id={tituloId}
                ref={tituloRef}
                tabIndex={-1}
                className="text-lg font-bold text-balance break-words focus:shadow-none focus:outline-none"
              >
                {r.contacto_nombre?.trim() || "Sin nombre de contacto"}
              </h2>
              {telefono && tel ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a
                    href={tel}
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold tabular-nums underline decoration-line decoration-2 underline-offset-4"
                  >
                    <Phone aria-hidden="true" className="size-4 text-ink-soft" />
                    <span>
                      <span className="sr-only">Llamar al </span>
                      {telefono}
                    </span>
                  </a>
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 font-semibold",
                        "transition-[scale,border-color] duration-140 ease-out motion-safe:active:scale-[0.97] hover:border-ink-soft",
                      )}
                    >
                      <MessageCircle aria-hidden="true" className="size-5 text-done" />
                      WhatsApp
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-ink-soft">Sin teléfono</p>
              )}
            </header>

            {/* Pendiente: primero lo que falta. Atendido: primero lo entregado. */}
            {pendiente ? (
              <>
                {seccionNecesita}
                {seccionEntregado}
              </>
            ) : (
              <>
                {seccionEntregado}
                {seccionNecesita}
              </>
            )}

            <Seccion titulo="Vivienda">
              <p>{DANIO_VIVIENDA_LABEL[r.danio_vivienda]}</p>
            </Seccion>

            <Seccion titulo="Personas">
              <p className="font-semibold">{textoPersonas(r.total_personas ?? 0)}</p>
              {edades.length > 0 && <p className="text-ink-soft">{edades.map((l) => l.texto).join(", ")}</p>}
              {especiales.length > 0 && (
                <ul className="mt-1 flex flex-col">
                  {especiales.map((l) => (
                    <li key={l.clave}>{l.texto}</li>
                  ))}
                </ul>
              )}
              {mascotas && <p className="mt-1 text-ink-soft">Mascotas: {mascotas}</p>}
            </Seccion>

            {conAcciones && (
              <AccionesFicha
                estado={r.estado}
                onEditar={onEditar}
                onRegistrarEntrega={onRegistrarEntrega}
                className="flex-col"
              />
            )}

            <div className="flex flex-col gap-4 border-t border-line pt-4">
              {plusCode && (
                <Seccion titulo="Plus Code">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold tracking-wide select-all">{plusCode}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={copiarPlusCode}
                      aria-label="Copiar Plus Code"
                      title="Copiar Plus Code"
                    >
                      <Copy aria-hidden="true" className="size-5" />
                    </Button>
                  </div>
                </Seccion>
              )}
              <a
                href={enlaceComoLlegar(r.lat, r.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-semibold",
                  "transition-[scale,border-color] duration-140 ease-out motion-safe:active:scale-[0.97] hover:border-ink-soft",
                )}
              >
                <Navigation aria-hidden="true" className="size-4" />
                Cómo llegar
              </a>

              <Foto reporte={r} fotoHeredada={fotoHeredada} />

              {(r.brigadista_texto || clubNombre) && (
                <Seccion titulo="Registró">
                  {r.brigadista_texto && <p>{r.brigadista_texto}</p>}
                  {clubNombre && <p className="text-ink-soft">{clubNombre}</p>}
                </Seccion>
              )}

              <div className="flex flex-col gap-1 text-sm text-ink-soft">
                {actualizado && (
                  <p>
                    Actualizado{" "}
                    <time dateTime={r.updated_at} title={fechaLarga(r.updated_at) ?? undefined}>
                      {actualizado}
                    </time>
                  </p>
                )}
                {r._sync !== "synced" && (
                  <p className="flex items-start gap-1.5 font-semibold text-ink">
                    <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {r._sync === "error"
                      ? "No se pudo enviar. Se reintentará solo."
                      : "Guardado en este celular. Se enviará cuando haya señal."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>

      {puedeBorrar && onBorrar && (
        <div className="flex flex-col gap-2 border-t border-dashed border-line pt-5">
          <p className="text-sm text-ink-soft">Borrar quita el reporte para todos los brigadistas.</p>
          <HoldToDelete onConfirm={onBorrar} label="Mantén pulsado para borrar" />
        </div>
      )}
    </div>
  );
}

export interface AccionesFichaProps {
  estado: Estado;
  onEditar: () => void;
  onRegistrarEntrega: () => void;
  className?: string;
}

/** Acciones de la ficha: si está pendiente, la principal es "Registrar entrega". */
export function AccionesFicha({ estado, onEditar, onRegistrarEntrega, className }: AccionesFichaProps) {
  const pendiente = estado === "PENDIENTE";
  return (
    <div className={cn("flex gap-2", className)}>
      {pendiente && (
        <Button size="lg" block onClick={onRegistrarEntrega} className="flex-1">
          <PackageCheck aria-hidden="true" className="size-5" />
          Registrar entrega
        </Button>
      )}
      <Button variant="secondary" size={pendiente ? "md" : "lg"} block={!pendiente} onClick={onEditar} className={pendiente ? "min-h-14" : undefined}>
        <Pencil aria-hidden="true" className="size-4" />
        Editar
      </Button>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-soft">{titulo}</h3>
      <div className="mt-0.5">{children}</div>
    </section>
  );
}

function ListaInsumos({ items, tono }: { items: string[]; tono: "pending" | "done" }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "rounded-md px-2 py-0.5 font-semibold",
            tono === "pending" ? "bg-pending-tint text-ink" : "bg-done-tint text-ink",
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Foto en Storage (bucket privado): se pide una URL firmada; sin señal se indica que existe. */
function FotoStorage({ reporte: r }: { reporte: ReporteLocal }) {
  const [resuelta, setResuelta] = useState<{ clave: string; url: string | null } | null>(null);
  const clave = `${r.id}:${r.foto_path}`;
  useEffect(() => {
    let vivo = true;
    getFotoUrl(r)
      .then((url) => vivo && setResuelta({ clave, url }))
      .catch(() => vivo && setResuelta({ clave, url: null }));
    return () => {
      vivo = false;
    };
  }, [r, clave]);
  const url = resuelta?.clave === clave ? resuelta.url : null;

  return (
    <Seccion titulo="Foto de la vivienda">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block rounded-md">
          <Image
            src={url}
            alt="Foto de la vivienda (abrir en tamaño completo)"
            width={160}
            height={120}
            unoptimized
            className="h-30 w-40 rounded-md border border-line object-cover"
          />
        </a>
      ) : (
        <p className="mt-1 flex items-center gap-2">
          <Camera aria-hidden="true" className="size-5 text-ink-soft" />
          {resuelta?.clave === clave ? "Foto guardada. Necesitas conexión para verla." : "Cargando foto…"}
        </p>
      )}
    </Seccion>
  );
}

function Foto({ reporte: r, fotoHeredada }: { reporte: ReporteLocal; fotoHeredada: string | null }) {
  if (r._fotoLocalUrl) {
    return (
      <Seccion titulo="Foto de la vivienda">
        {/* Foto aún no subida: URL blob: local (no pasa por next/image). */}
        <Image
          src={r._fotoLocalUrl}
          alt="Foto de la vivienda"
          width={160}
          height={120}
          unoptimized
          className="mt-1 h-30 w-40 rounded-md border border-line object-cover"
        />
      </Seccion>
    );
  }
  if (r.foto_path) return <FotoStorage reporte={r} />;
  if (fotoHeredada) {
    return (
      <Seccion titulo="Foto de la vivienda">
        <a
          href={fotoHeredada}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-rotary underline underline-offset-4"
        >
          <Camera aria-hidden="true" className="size-5" />
          Ver foto
        </a>
      </Seccion>
    );
  }
  return null;
}
