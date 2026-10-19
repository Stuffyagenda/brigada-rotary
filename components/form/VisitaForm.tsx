"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useAhora } from "@/hooks/useAhora";
import { useReporte } from "@/hooks/useReportes";
import { useProfile } from "@/lib/auth/profile";
import { leerUltimoBrigadista, recordarBrigadista } from "@/lib/brigadista";
import { cn } from "@/lib/cn";
import type { ReporteLocal } from "@/lib/db";
import { MSG_VISITA_SIN_REPORTE, saveVisita } from "@/lib/sync";
import { INSUMOS, OTROS_INSUMOS, type VisitaInput } from "@/lib/types";
import { diasDesdeAtencion, formatearFechaLarga, hoyPanama, textoAtendidoHace } from "@/lib/vigencia";
import { Aviso } from "./Aviso";
import { ErrorCampo, Etiqueta, FilaSiNo, GrupoChips, inputClass, inputFechaClass, Seccion } from "./campos";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusHeader } from "./StatusHeader";
import {
  construirVisita,
  esAnteriorALaAtencion,
  esVisitaVacia,
  validarVisita,
  valoresInicialesVisita,
  type VisitaValues,
} from "./visita-values";

export interface VisitaFormProps {
  /** Reporte (ya ATENDIDO o PENDIENTE) al que se añade la visita. */
  reporteId: string;
  /** Cierra sin guardar (si había cambios, el usuario ya confirmó descartarlos). */
  onClose: () => void;
  /** Se llamó a saveVisita con éxito. */
  onSaved: (visitaId: string) => void;
  /** Opcional: avisa cuando el formulario pasa a tener (o deja de tener) cambios sin guardar. */
  onDirtyChange?: (dirty: boolean) => void;
}

export const MENSAJES_VISITA = {
  synced: "Visita registrada.",
  pending: "Visita guardada en este celular. Se enviará cuando haya conexión.",
  error: "No se pudo guardar la visita en este celular. Revisa el espacio disponible e inténtalo de nuevo.",
  confirmar: "¿Registrar esta visita?",
} as const;

/** Descripción del diálogo de confirmación según la fecha de la visita. */
export function descripcionConfirmacionVisita(fecha: string, hoy: string, anteriorALaAtencion = false): string {
  if (anteriorALaAtencion) {
    return (
      `La visita del ${formatearFechaLarga(fecha)} es anterior a la última atención: ` +
      "quedará en el historial y la familia seguirá con la atención más reciente."
    );
  }
  return fecha === hoy
    ? "La familia volverá a aparecer como atendida hoy."
    : `La familia volverá a aparecer como atendida el ${formatearFechaLarga(fecha)}.`;
}

/** Nombre visible del registro: el contacto o "Registro <8 primeros del id>". */
export function nombreRegistro(r: Pick<ReporteLocal, "id" | "contacto_nombre">): string {
  return r.contacto_nombre?.trim() || `Registro ${r.id.slice(0, 8)}`;
}

/**
 * Formulario corto para registrar una visita (nueva entrega) a una familia ya
 * registrada. Carga el reporte local con `useReporte` para mostrar su contexto.
 */
export function VisitaForm(props: VisitaFormProps) {
  const { reporte, loading } = useReporte(props.reporteId);

  if (loading) {
    return (
      <Aviso onClose={props.onClose}>
        <p role="status" className="text-ink-soft">
          Cargando reporte…
        </p>
      </Aviso>
    );
  }
  if (!reporte) {
    return (
      <Aviso onClose={props.onClose}>
        <p className="font-semibold text-ink">No se encontró el reporte.</p>
        <p className="text-ink-soft">Puede que aún no se haya sincronizado. Vuelve al mapa y ábrelo de nuevo.</p>
      </Aviso>
    );
  }
  return <FormularioVisita key={props.reporteId} {...props} reporte={reporte} />;
}

interface Confirmacion {
  valores: VisitaValues;
  input: VisitaInput;
  descripcion: string;
}

const ID_ERROR_ENTREGAS = "error-entregas";

function FormularioVisita({
  reporte,
  reporteId,
  onClose,
  onSaved,
  onDirtyChange,
}: VisitaFormProps & { reporte: ReporteLocal }) {
  const { profile } = useProfile();
  const ahora = useAhora();
  // Tope del selector de fecha: hoy en Panamá al abrir el formulario.
  const [hoy] = useState(() => hoyPanama());
  const [defaults] = useState(() => valoresInicialesVisita(profile?.nombre_completo));

  const { control, register, handleSubmit, setError, clearErrors, resetField, reset, getValues, getFieldState, formState } =
    useForm<VisitaValues>({ defaultValues: defaults });
  const { errors } = formState;

  // El perfil puede llegar después de abrir el formulario: rellena el brigadista si no se tocó.
  const nombrePerfil = profile?.nombre_completo ?? null;
  useEffect(() => {
    if (!nombrePerfil || getValues("brigadista_texto")) return;
    resetField("brigadista_texto", { defaultValue: nombrePerfil });
  }, [nombrePerfil, getValues, resetField]);

  // El último brigadista escrito a mano gana al nombre del perfil (si aún no se tocó el campo).
  useEffect(() => {
    let vivo = true;
    void leerUltimoBrigadista().then((ultimo) => {
      if (!vivo || !ultimo || getFieldState("brigadista_texto").isDirty) return;
      resetField("brigadista_texto", { defaultValue: ultimo });
    });
    return () => {
      vivo = false;
    };
  }, [getFieldState, resetField]);

  const entregas = useWatch({ control, name: [...INSUMOS.map((i) => i.entColumna), "ent_otros", "observaciones"] });
  const vacia = esVisitaVacia(
    Object.fromEntries(
      [...INSUMOS.map((i) => i.entColumna), "ent_otros", "observaciones"].map((k, n) => [k, entregas[n]]),
    ) as Parameters<typeof esVisitaVacia>[0],
  );

  const [mensajeVacia, setMensajeVacia] = useState<string | null>(null);
  // El aviso de visita vacía desaparece en cuanto se marca una entrega o se escribe algo.
  const errorVacia = vacia ? mensajeVacia : null;
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [confirmarAbierto, setConfirmarAbierto] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const [intentoFallido, setIntentoFallido] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const dirty = formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Foco al primer error tras un intento de guardar.
  useEffect(() => {
    if (!intentoFallido) return;
    const el = formRef.current?.querySelector<HTMLElement>('[data-error="true"], [aria-invalid="true"]');
    el?.focus();
  }, [intentoFallido]);

  const errorDe = (campo: keyof VisitaValues) => errors[campo]?.message as string | undefined;
  const aria = (campo: keyof VisitaValues) =>
    errorDe(campo) ? { "aria-invalid": true as const, "aria-describedby": `error-${campo}` } : {};

  const enviar = handleSubmit((valores) => {
    if (guardando) return;
    clearErrors();
    const input = construirVisita(reporteId, valores);
    const errores = validarVisita(input);
    const campos = Object.keys(errores);
    setMensajeVacia(errores.entregas ?? null);
    if (campos.length > 0) {
      for (const campo of campos) {
        if (campo in valores) setError(campo as Path<VisitaValues>, { type: "manual", message: errores[campo] });
      }
      setIntentoFallido((n) => n + 1);
      return;
    }
    const anterior = reporte.estado === "ATENDIDO" && esAnteriorALaAtencion(input.fecha, reporte.attended_at);
    setConfirmacion({
      valores,
      input,
      descripcion: descripcionConfirmacionVisita(input.fecha, hoyPanama(), anterior),
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
      const res = await saveVisita(c.input);
      if (res.status === "synced") toast.success(MENSAJES_VISITA.synced);
      else toast(MENSAJES_VISITA.pending);
      void recordarBrigadista(c.input.brigadista_texto, profile?.nombre_completo);
      reset(c.valores);
      onSaved(res.id);
    } catch (e) {
      toast.error(e instanceof Error && e.message === MSG_VISITA_SIN_REPORTE ? MSG_VISITA_SIN_REPORTE : MENSAJES_VISITA.error);
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  };

  const pedirCierre = () => {
    if (dirty) setDescartar(true);
    else onClose();
  };

  const nombre = nombreRegistro(reporte);
  const dias = diasDesdeAtencion(reporte, ahora);

  return (
    <div className="flex h-full max-h-full min-h-0 flex-col bg-paper">
      <StatusHeader estado="ATENDIDO" sello="Nueva visita" titulo="Registrar visita" onClose={pedirCierre} />

      <form
        ref={formRef}
        noValidate
        onSubmit={enviar}
        aria-label={`Registrar visita: ${nombre}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Contexto del registro */}
          <div className="border-b border-line bg-white px-4 py-3" data-testid="contexto-visita">
            <p className="text-lg font-bold leading-snug text-ink">{nombre}</p>
            {dias !== null && <p className="text-base text-ink-soft">Última atención: {textoAtendidoHace(dias)}</p>}
          </div>

          <Seccion titulo="Datos de la visita">
            <div>
              <Etiqueta htmlFor="visita-fecha">Fecha de la visita</Etiqueta>
              <input
                id="visita-fecha"
                type="date"
                max={hoy}
                required
                className={inputFechaClass}
                {...aria("fecha")}
                {...register("fecha", { onChange: () => clearErrors("fecha") })}
              />
              <ErrorCampo id="error-fecha" mensaje={errorDe("fecha")} />
            </div>
            <div>
              <Etiqueta htmlFor="visita-brigadista">Brigadista responsable</Etiqueta>
              <input
                id="visita-brigadista"
                type="text"
                autoComplete="name"
                placeholder="Tu nombre"
                className={inputClass}
                {...aria("brigadista_texto")}
                {...register("brigadista_texto", { onChange: () => clearErrors("brigadista_texto") })}
              />
              <ErrorCampo id="error-brigadista_texto" mensaje={errorDe("brigadista_texto")} />
            </div>

            <fieldset className="min-w-0" aria-describedby={errorVacia ? ID_ERROR_ENTREGAS : "ayuda-entregas"}>
              <legend className="mb-1 text-base font-semibold text-ink">Entregas</legend>
              <p id="ayuda-entregas" className="mb-2 text-sm text-ink-soft">
                Marca Sí en lo que se entregó en esta visita.
              </p>
              {errorVacia && (
                <p
                  id={ID_ERROR_ENTREGAS}
                  role="alert"
                  tabIndex={-1}
                  data-error="true"
                  className="mb-2 rounded-lg border-l-4 border-pending bg-pending-tint/40 px-3 py-2 text-sm font-semibold text-pending"
                >
                  {errorVacia}
                </p>
              )}
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
            </fieldset>

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
              <Etiqueta htmlFor="visita-observaciones" opcional>
                Observaciones
              </Etiqueta>
              <textarea
                id="visita-observaciones"
                rows={3}
                placeholder="Ej.: Se entregó agua para 5 días."
                className={cn(inputClass, "py-2.5 leading-snug")}
                {...aria("observaciones")}
                {...register("observaciones", { onChange: () => clearErrors("observaciones") })}
              />
              <ErrorCampo id="error-observaciones" mensaje={errorDe("observaciones")} />
            </div>
          </Seccion>
          <div className="h-4" aria-hidden="true" />
        </div>

        {/* Barra inferior fija */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={pedirCierre} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="lg"
              className="min-w-0 flex-1 whitespace-nowrap px-4"
              disabled={guardando}
              aria-busy={guardando || undefined}
            >
              {guardando ? "Guardando…" : "Guardar visita"}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmarAbierto}
        onOpenChange={setConfirmarAbierto}
        title={MENSAJES_VISITA.confirmar}
        description={confirmacion?.descripcion ?? ""}
        confirmLabel="Registrar visita"
        cancelLabel="Seguir editando"
        onConfirm={guardar}
      />
      <ConfirmDialog
        open={descartar}
        onOpenChange={setDescartar}
        title="¿Descartar los cambios?"
        description="Lo que escribiste en esta visita no se guardará."
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
