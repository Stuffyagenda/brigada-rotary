"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Counter } from "@/components/ui/Counter";
import { useReporte } from "@/hooks/useReportes";
import { useProfile } from "@/lib/auth/profile";
import { leerUltimoBrigadista, recordarBrigadista } from "@/lib/brigadista";
import { cn } from "@/lib/cn";
import type { ReporteLocal } from "@/lib/db";
import { encodePlusCode, type LatLng } from "@/lib/pluscode";
import { mensajeConfirmacion } from "@/lib/report-diff";
import { condicionesMedicasActivas, seccionesVisibles } from "@/lib/report-rules";
import { saveReport } from "@/lib/sync";
import { hoyPanama } from "@/lib/vigencia";
import {
  CONDICIONES_MEDICAS,
  CONTADORES,
  DANIO_VIVIENDA_OPCIONES,
  ESTADO_LABEL,
  INSUMOS,
  OTROS_INSUMOS,
  totalPersonas,
  type Estado,
  type Prioridad,
  type ReporteInput,
} from "@/lib/types";
import {
  Casilla,
  ErrorCampo,
  Etiqueta,
  FilaSiNo,
  GrupoChips,
  inputClass,
  inputFechaClass,
  Seccion,
  Segmentado,
} from "./campos";
import { Aviso } from "./Aviso";
import { ConfirmDialog } from "./ConfirmDialog";
import { construirPayload, validarPayload, valoresIniciales, type FormValues } from "./form-values";
import { PhotoField } from "./PhotoField";
import { StatusHeader } from "./StatusHeader";

export interface ReportFormProps {
  /** Id del reporte a editar, o "nuevo" para crear uno. */
  reporteId: string | "nuevo";
  /**
   * Ubicación elegida en el mapa (GPS, toque en el mapa o búsqueda).
   * La controla la pantalla del mapa; el formulario la muestra (con su Plus Code)
   * y la guarda. Si cambia mientras el formulario está abierto, se usa la nueva.
   * Al editar, si es `null` se conserva la ubicación guardada del reporte.
   */
  ubicacion: LatLng | null;
  /** El usuario pide cambiar la ubicación: el mapa activa el modo "elegir en mapa". */
  onRequestPickLocation: () => void;
  /** Cierra el formulario sin guardar (si había cambios, el usuario ya confirmó descartarlos). */
  onClose: () => void;
  /** Se llamó a saveReport con éxito. */
  onSaved: (id: string, estado: "PENDIENTE" | "ATENDIDO") => void;
  /** Opcional: avisa cuando el formulario pasa a tener (o deja de tener) cambios sin guardar. */
  onDirtyChange?: (dirty: boolean) => void;
}

export const MENSAJES_GUARDADO = {
  synced: "Reporte guardado.",
  pending: "Reporte guardado en este celular. Se enviará cuando haya conexión.",
  error: "No se pudo guardar el reporte en este celular. Revisa el espacio disponible e inténtalo de nuevo.",
  sinUbicacion: "Elige la ubicación de la vivienda antes de guardar.",
} as const;

/**
 * Formulario de reporte (crear y editar). Carga el reporte local con
 * `useReporte`; para "nuevo" parte de `reporteVacio`.
 */
export function ReportForm(props: ReportFormProps) {
  const esNuevo = props.reporteId === "nuevo";
  const { reporte, loading } = useReporte(esNuevo ? null : props.reporteId);

  if (!esNuevo && loading) {
    return (
      <Aviso onClose={props.onClose}>
        <p role="status" className="text-ink-soft">
          Cargando reporte…
        </p>
      </Aviso>
    );
  }
  if (!esNuevo && !reporte) {
    return (
      <Aviso onClose={props.onClose}>
        <p className="font-semibold text-ink">No se encontró el reporte.</p>
        <p className="text-ink-soft">Puede que se haya borrado. Vuelve al mapa y ábrelo de nuevo.</p>
      </Aviso>
    );
  }
  return <Formulario key={props.reporteId} {...props} reporte={esNuevo ? null : (reporte ?? null)} />;
}

const ESTADO_SEGMENTOS = [
  { value: "PENDIENTE", label: ESTADO_LABEL.PENDIENTE, marcado: "bg-pending font-semibold text-white" },
  { value: "ATENDIDO", label: ESTADO_LABEL.ATENDIDO, marcado: "bg-done font-semibold text-white" },
] as const;

/** Etiquetas cortas para que las tres opciones quepan en una línea a 360 px. */
const PRIORIDAD_SEGMENTOS = [
  { value: "ALTA", label: "Alta" },
  { value: "MEDIA", label: "Media" },
  { value: "BAJA", label: "Baja" },
] as const;

interface Confirmacion {
  valores: FormValues;
  payload: ReporteInput;
  mensaje: string;
}

function Formulario({
  reporte,
  ubicacion,
  onRequestPickLocation,
  onClose,
  onSaved,
  onDirtyChange,
}: ReportFormProps & { reporte: ReporteLocal | null }) {
  const esNuevo = reporte === null;
  const { profile, club } = useProfile();
  // Copia del reporte al abrir: los valores iniciales no cambian aunque llegue una actualización del sync.
  const [inicial] = useState(reporte);
  const [defaults] = useState(() =>
    valoresIniciales(inicial, { brigadista: profile?.nombre_completo, clubId: profile?.club_id ?? club?.id }),
  );

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    resetField,
    reset,
    getValues,
    getFieldState,
    formState,
  } = useForm<FormValues>({ defaultValues: defaults });
  const { errors } = formState;
  // Tope del selector de fecha: hoy en Panamá al abrir el formulario.
  const [hoy] = useState(() => hoyPanama());

  // El perfil puede llegar después de abrir el formulario: rellena el brigadista si no se tocó.
  const nombrePerfil = profile?.nombre_completo ?? null;
  useEffect(() => {
    if (!esNuevo || !nombrePerfil) return;
    if (getValues("brigadista_texto")) return;
    resetField("brigadista_texto", { defaultValue: nombrePerfil });
  }, [esNuevo, nombrePerfil, getValues, resetField]);

  // Reporte nuevo: el último brigadista escrito a mano gana al nombre del perfil
  // (si la persona aún no tocó el campo).
  useEffect(() => {
    if (!esNuevo) return;
    let vivo = true;
    void leerUltimoBrigadista().then((ultimo) => {
      if (!vivo || !ultimo || getFieldState("brigadista_texto").isDirty) return;
      resetField("brigadista_texto", { defaultValue: ultimo });
    });
    return () => {
      vivo = false;
    };
  }, [esNuevo, getFieldState, resetField]);

  const [estado, chkEntrega, chkNecesidad, casosMedicos, adultos, mayores, menores] = useWatch({
    control,
    name: ["estado", "chkEntrega", "chkNecesidad", "casos_medicos", "adultos", "adultos_mayores", "menores"],
  });
  const visibles = seccionesVisibles(estado, chkEntrega, chkNecesidad);
  const total = totalPersonas({ adultos, adultos_mayores: mayores, menores });

  const [foto, setFoto] = useState<Blob | null>(null);
  // La confirmación se conserva al cerrar el diálogo para que el texto no desaparezca durante su salida.
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [confirmarAbierto, setConfirmarAbierto] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const [errorUbicacionGuardado, setErrorUbicacion] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [intentoFallido, setIntentoFallido] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Ubicación efectiva: la del mapa; al editar, la guardada si el mapa no manda ninguna.
  const ubic: LatLng | null = ubicacion ?? (inicial ? { lat: inicial.lat, lng: inicial.lng } : null);
  const plusCode = ubic ? encodePlusCode(ubic.lat, ubic.lng) : null;
  const ubicacionCambio =
    inicial !== null &&
    ubic !== null &&
    (Math.abs(ubic.lat - inicial.lat) > 1e-7 || Math.abs(ubic.lng - inicial.lng) > 1e-7);
  // "Elige la ubicación…" deja de mostrarse en cuanto el mapa manda una.
  const errorUbicacion =
    errorUbicacionGuardado === MENSAJES_GUARDADO.sinUbicacion && ubic ? null : errorUbicacionGuardado;
  const dirty = formState.isDirty || foto !== null || ubicacionCambio;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Foco al primer error tras un intento de guardar.
  useEffect(() => {
    if (!intentoFallido) return;
    const el = formRef.current?.querySelector<HTMLElement>('[data-error="true"], [aria-invalid="true"]');
    el?.focus();
  }, [intentoFallido]);

  const errorDe = (campo: keyof FormValues) => errors[campo]?.message as string | undefined;
  const aria = (campo: keyof FormValues) =>
    errorDe(campo) ? { "aria-invalid": true as const, "aria-describedby": `error-${campo}` } : {};

  const enviar = handleSubmit((valores) => {
    if (guardando) return;
    clearErrors();
    setErrorGeneral(null);
    if (!ubic) {
      setErrorUbicacion(MENSAJES_GUARDADO.sinUbicacion);
      setIntentoFallido((n) => n + 1);
      return;
    }
    setErrorUbicacion(null);
    const clubId = valores.club_id ?? (esNuevo ? (profile?.club_id ?? club?.id ?? null) : null);
    const payload = construirPayload({ ...valores, club_id: clubId }, ubic);
    const errores = validarPayload(payload);
    const campos = Object.keys(errores);
    if (campos.length > 0) {
      const desconocidos: string[] = [];
      for (const campo of campos) {
        if (campo === "lat" || campo === "lng") setErrorUbicacion(errores[campo]);
        else if (campo in valores) setError(campo as Path<FormValues>, { type: "manual", message: errores[campo] });
        else desconocidos.push(errores[campo]);
      }
      setErrorGeneral(desconocidos[0] ?? "Revisa los datos marcados en rojo.");
      setIntentoFallido((n) => n + 1);
      return;
    }
    // Se compara con lo guardado ahora mismo en el celular (puede haber cambiado por el sync).
    const previo = esNuevo ? null : (reporte ?? inicial);
    setConfirmacion({
      valores,
      payload,
      mensaje: mensajeConfirmacion(previo, payload, { hayFotoNueva: foto !== null }),
    });
    setConfirmarAbierto(true);
  });

  const guardar = async () => {
    const c = confirmacion;
    setConfirmarAbierto(false);
    if (!c || guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const res = await saveReport(c.payload, foto);
      if (res.status === "synced") toast.success(MENSAJES_GUARDADO.synced);
      else toast(MENSAJES_GUARDADO.pending);
      // Al editar solo cuenta si se cambió el campo (no se adopta el brigadista de otro reporte).
      if (esNuevo || getFieldState("brigadista_texto").isDirty) {
        void recordarBrigadista(c.payload.brigadista_texto, profile?.nombre_completo);
      }
      reset(c.valores);
      setFoto(null);
      onSaved(res.id, c.payload.estado);
    } catch {
      toast.error(MENSAJES_GUARDADO.error);
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const pedirCierre = () => {
    if (dirty) setDescartar(true);
    else onClose();
  };

  const seccionNecesidades = (
    <Seccion titulo="Necesidades" descripcion="Marca Sí en lo que la familia necesita.">
      <div className="flex flex-col gap-1">
        {INSUMOS.map((i) => (
          <Controller
            key={i.necColumna}
            control={control}
            name={i.necColumna}
            render={({ field }) => <FilaSiNo label={i.necLabel} value={field.value} onChange={field.onChange} />}
          />
        ))}
      </div>
      <Controller
        control={control}
        name="nec_otros"
        render={({ field }) => (
          <GrupoChips
            legend="Otros insumos que necesita (opcional)"
            opciones={OTROS_INSUMOS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </Seccion>
  );

  const seccionEntregas = (
    <Seccion titulo="Entregas" descripcion="Marca Sí en lo que se entregó en esta visita.">
      <div className="flex flex-col gap-1">
        {INSUMOS.map((i) => (
          <Controller
            key={i.entColumna}
            control={control}
            name={i.entColumna}
            render={({ field }) => <FilaSiNo label={i.entLabel} value={field.value} onChange={field.onChange} />}
          />
        ))}
      </div>
      <Controller
        control={control}
        name="ent_otros"
        render={({ field }) => (
          <GrupoChips
            legend="Otros insumos entregados (opcional)"
            opciones={OTROS_INSUMOS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <div>
        <Etiqueta htmlFor="campo-observaciones" opcional>
          Observaciones de la atención
        </Etiqueta>
        <textarea
          id="campo-observaciones"
          rows={3}
          placeholder="Ej.: Se entregó lona y agua para 5 días."
          className={cn(inputClass, "py-2.5 leading-snug")}
          {...aria("observaciones_atencion")}
          {...register("observaciones_atencion", { onChange: () => clearErrors("observaciones_atencion") })}
        />
        <ErrorCampo id="error-observaciones_atencion" mensaje={errorDe("observaciones_atencion")} />
      </div>
    </Seccion>
  );

  const casilla = (tipo: "chkEntrega" | "chkNecesidad", label: string) => (
    <div className="border-b border-line px-4 py-4">
      <Controller
        control={control}
        name={tipo}
        render={({ field }) => <Casilla label={label} checked={field.value} onChange={field.onChange} />}
      />
    </div>
  );

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-paper">
      <StatusHeader
        estado={estado}
        titulo={esNuevo ? "Registrar familia" : "Editar reporte"}
        subtitulo={plusCode ?? "Sin ubicación"}
        onClose={pedirCierre}
      />

      <form
        ref={formRef}
        noValidate
        onSubmit={enviar}
        aria-label={esNuevo ? "Registrar familia" : "Editar reporte"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* 1. Ubicación */}
          <Seccion titulo="Ubicación">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {plusCode && ubic ? (
                  <>
                    <p className="text-xl font-bold tabular-nums text-ink">{plusCode}</p>
                    <p className="text-sm tabular-nums text-ink-soft">
                      {ubic.lat.toFixed(5)}, {ubic.lng.toFixed(5)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-ink">Sin ubicación</p>
                    <p className="text-sm text-ink-soft">Toca el mapa, usa tu GPS o busca la comunidad.</p>
                  </>
                )}
              </div>
              <Button
                variant="secondary"
                onClick={onRequestPickLocation}
                data-error={errorUbicacion ? "true" : undefined}
                aria-describedby={errorUbicacion ? "error-ubicacion" : undefined}
                className={cn("shrink-0", errorUbicacion && "border-pending")}
              >
                <MapPin aria-hidden="true" className="size-5" />
                {plusCode ? "Cambiar" : "Elegir ubicación"}
              </Button>
            </div>
            {errorUbicacion && (
              <p id="error-ubicacion" role="alert" className="-mt-1 text-sm font-semibold text-pending">
                {errorUbicacion}
              </p>
            )}
          </Seccion>

          {/* 2. Estado, prioridad y daño */}
          <Seccion titulo="Estado del caso">
            <div>
              <Etiqueta htmlFor="campo-fecha-reporte">Fecha del reporte</Etiqueta>
              <input
                id="campo-fecha-reporte"
                type="date"
                max={hoy}
                required
                className={inputFechaClass}
                {...aria("fecha_reporte")}
                {...register("fecha_reporte", { onChange: () => clearErrors("fecha_reporte") })}
              />
              <ErrorCampo id="error-fecha_reporte" mensaje={errorDe("fecha_reporte")} />
            </div>
            <Controller
              control={control}
              name="estado"
              render={({ field }) => (
                <Segmentado<Estado>
                  legend="Estado"
                  name="estado"
                  opciones={ESTADO_SEGMENTOS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              control={control}
              name="prioridad"
              render={({ field }) => (
                <Segmentado<Prioridad>
                  legend="Prioridad"
                  name="prioridad"
                  opciones={PRIORIDAD_SEGMENTOS}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <div>
              <Etiqueta htmlFor="campo-danio">Daño de la vivienda</Etiqueta>
              <div className="relative">
                <select
                  id="campo-danio"
                  className={cn(inputClass, "appearance-none pr-11")}
                  {...aria("danio_vivienda")}
                  {...register("danio_vivienda")}
                >
                  {DANIO_VIVIENDA_OPCIONES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-ink-soft"
                />
              </div>
              <ErrorCampo id="error-danio_vivienda" mensaje={errorDe("danio_vivienda")} />
            </div>
          </Seccion>

          {/* 3. Foto */}
          <Seccion titulo="Foto de la vivienda" descripcion="Opcional. Se guarda comprimida.">
            <PhotoField
              reporteId={inicial?.id}
              fotoUrl={inicial?.foto_url}
              fotoPath={inicial?.foto_path}
              value={foto}
              onChange={setFoto}
            />
          </Seccion>

          {/* 4. Contacto */}
          <Seccion titulo="Contacto">
            <div>
              <Etiqueta htmlFor="campo-brigadista">Brigadista responsable</Etiqueta>
              <input
                id="campo-brigadista"
                type="text"
                autoComplete="name"
                placeholder="Tu nombre"
                className={inputClass}
                {...aria("brigadista_texto")}
                {...register("brigadista_texto", { onChange: () => clearErrors("brigadista_texto") })}
              />
              <ErrorCampo id="error-brigadista_texto" mensaje={errorDe("brigadista_texto")} />
            </div>
            <div>
              <Etiqueta htmlFor="campo-contacto">Nombre del jefe o jefa de hogar</Etiqueta>
              <input
                id="campo-contacto"
                type="text"
                autoComplete="off"
                autoCapitalize="words"
                placeholder="Nombre completo"
                className={inputClass}
                {...aria("contacto_nombre")}
                {...register("contacto_nombre", { onChange: () => clearErrors("contacto_nombre") })}
              />
              <ErrorCampo id="error-contacto_nombre" mensaje={errorDe("contacto_nombre")} />
            </div>
            <div>
              <Etiqueta htmlFor="campo-telefono">Teléfono o WhatsApp</Etiqueta>
              <input
                id="campo-telefono"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="6000-0000"
                className={cn(inputClass, "tabular-nums")}
                {...aria("contacto_telefono")}
                {...register("contacto_telefono", { onChange: () => clearErrors("contacto_telefono") })}
              />
              <ErrorCampo id="error-contacto_telefono" mensaje={errorDe("contacto_telefono")} />
            </div>
          </Seccion>

          {/* 5. Censo */}
          <Seccion
            titulo="Censo de la familia"
            extra={
              <span className="text-base text-ink-soft">
                Total{" "}
                <output aria-live="polite" data-testid="total-personas" className="text-xl font-bold text-ink">
                  {total}
                </output>
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              {CONTADORES.map((c) => (
                <div key={c.columna}>
                  <Controller
                    control={control}
                    name={c.columna}
                    render={({ field }) => (
                      <Counter
                        label={c.label}
                        value={field.value}
                        onChange={(n) => {
                          field.onChange(n);
                          if (c.columna === "casos_medicos" && !condicionesMedicasActivas(n)) {
                            setValue("condiciones_medicas", [], { shouldDirty: true });
                          }
                        }}
                      />
                    )}
                  />
                  <ErrorCampo id={`error-${c.columna}`} mensaje={errorDe(c.columna)} />
                  {c.columna === "casos_medicos" && condicionesMedicasActivas(casosMedicos) && (
                    <div className="mt-2 mb-2 rounded-lg border-l-4 border-pending bg-white py-3 pr-3 pl-3">
                      <Controller
                        control={control}
                        name="condiciones_medicas"
                        render={({ field }) => (
                          <GrupoChips
                            legend="Condiciones médicas"
                            opciones={CONDICIONES_MEDICAS}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Seccion>

          {/* 6. Necesidades y entregas: primero la sección principal del estado y luego la casilla que abre la otra. */}
          {estado === "PENDIENTE" ? (
            <>
              {visibles.necesidades && seccionNecesidades}
              {visibles.casillaEntrega && casilla("chkEntrega", "¿Se hizo alguna entrega en esta visita?")}
              {visibles.entregas && seccionEntregas}
            </>
          ) : (
            <>
              {visibles.entregas && seccionEntregas}
              {visibles.casillaNecesidad && casilla("chkNecesidad", "¿La familia tiene alguna necesidad pendiente?")}
              {visibles.necesidades && seccionNecesidades}
            </>
          )}
          <div className="h-4" aria-hidden="true" />
        </div>

        {/* Barra inferior fija */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {errorGeneral ? (
            <p role="alert" className="mb-2 text-sm font-semibold text-pending">
              {errorGeneral}
            </p>
          ) : (
            errorUbicacion && (
              // Repetido para quien mira la barra; el lector de pantalla ya lo oye junto al botón de ubicación.
              <p aria-hidden="true" className="mb-2 text-sm font-semibold text-pending">
                {errorUbicacion}
              </p>
            )
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={pedirCierre} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" className="min-w-0 flex-1 whitespace-nowrap px-4" disabled={guardando} aria-busy={guardando || undefined}>
              {guardando ? "Guardando…" : "Guardar reporte"}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmarAbierto}
        onOpenChange={setConfirmarAbierto}
        title={confirmacion?.mensaje ?? ""}
        confirmLabel="Guardar"
        cancelLabel="Seguir editando"
        onConfirm={guardar}
      />
      <ConfirmDialog
        open={descartar}
        onOpenChange={setDescartar}
        title="¿Descartar los cambios?"
        description="Lo que escribiste en este formulario no se guardará."
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        tone="danger"
        onConfirm={() => {
          setDescartar(false);
          onClose();
        }}
      />
    </div>
  );
}
