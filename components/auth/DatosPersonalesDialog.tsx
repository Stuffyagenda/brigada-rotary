"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { DIALOG_KEYFRAMES, DIALOG_STYLE_HREF } from "@/components/admin/ConfirmDialog";
import { Campo, campoDescribedBy, inputClass } from "@/components/auth/campos";
import { Button } from "@/components/ui/Button";
import { NOMBRE_MAX, validarNombreApellido, type ErroresNombre } from "@/lib/auth/nombre";

export interface DatosPersonales {
  nombre: string;
  apellido: string;
}

export interface DatosPersonalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Valores al abrir (null se muestra vacío). */
  inicial: { nombre: string | null; apellido: string | null };
  /**
   * Guarda los datos (ya recortados). Si lanza, el diálogo sigue abierto y
   * muestra `error.message`; si termina bien, se cierra.
   */
  onSave: (datos: DatosPersonales) => Promise<void>;
  /** `false` si un admin edita a otro miembro (mensajes "Escribe el nombre."). */
  propio?: boolean;
  /** Dónde vuelve el foco al cerrar (por defecto, el elemento que lo abrió). */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Diálogo para editar nombre y apellido (Radix Dialog). Lo usan "Editar mis
 * datos" del menú de cuenta y /miembros (admin). Necesita conexión.
 */
export function DatosPersonalesDialog({
  open,
  onOpenChange,
  title,
  description,
  inicial,
  onSave,
  propio = true,
  onCloseAutoFocus,
}: DatosPersonalesDialogProps) {
  const [guardando, setGuardando] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        // Mientras se guarda no se cierra (Esc o clic fuera).
        if (!guardando) onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <style href={DIALOG_STYLE_HREF} precedence="default">
          {DIALOG_KEYFRAMES}
        </style>
        <Dialog.Overlay className="br-overlay fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="br-dialog fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-white p-6 shadow-[0_16px_48px_-12px_rgb(28_39_51/0.35)]"
        >
          <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-ink-soft">{description}</Dialog.Description>
          {/* Se monta en cada apertura: los campos empiezan con los valores actuales. */}
          <FormularioDatos
            inicial={inicial}
            propio={propio}
            guardando={guardando}
            setGuardando={setGuardando}
            onSave={async (datos) => {
              await onSave(datos);
              onOpenChange(false);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface FormularioDatosProps {
  inicial: DatosPersonalesDialogProps["inicial"];
  propio: boolean;
  guardando: boolean;
  setGuardando: (v: boolean) => void;
  onSave: (datos: DatosPersonales) => Promise<void>;
}

function FormularioDatos({ inicial, propio, guardando, setGuardando, onSave }: FormularioDatosProps) {
  const id = useId();
  const nombreId = `${id}-nombre`;
  const apellidoId = `${id}-apellido`;
  const errorId = `${id}-error`;
  const nombreRef = useRef<HTMLInputElement>(null);
  const apellidoRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState(inicial.nombre ?? "");
  const [apellido, setApellido] = useState(inicial.apellido ?? "");
  const [intentado, setIntentado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errores: ErroresNombre = intentado ? validarNombreApellido(nombre, apellido, propio) : {};

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (guardando) return;
    setIntentado(true);
    setError(null);
    const actuales = validarNombreApellido(nombre, apellido, propio);
    if (actuales.nombre) return nombreRef.current?.focus();
    if (actuales.apellido) return apellidoRef.current?.focus();

    setGuardando(true);
    try {
      await onSave({ nombre: nombre.trim(), apellido: apellido.trim() });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Inténtalo de nuevo.");
      nombreRef.current?.focus();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={guardando} className="mt-5 flex flex-col gap-5">
      <Campo id={nombreId} label="Nombre" error={errores.nombre}>
        <input
          ref={nombreRef}
          id={nombreId}
          name="nombre"
          type="text"
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={NOMBRE_MAX}
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-invalid={errores.nombre ? true : undefined}
          aria-describedby={campoDescribedBy(nombreId, { error: errores.nombre })}
          className={inputClass}
        />
      </Campo>
      <Campo id={apellidoId} label="Apellido" error={errores.apellido}>
        <input
          ref={apellidoRef}
          id={apellidoId}
          name="apellido"
          type="text"
          autoComplete="family-name"
          autoCapitalize="words"
          maxLength={NOMBRE_MAX}
          required
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          aria-invalid={errores.apellido ? true : undefined}
          aria-describedby={campoDescribedBy(apellidoId, { error: errores.apellido })}
          className={inputClass}
        />
      </Campo>

      <div aria-live="assertive" aria-atomic="true">
        {error && (
          <p
            id={errorId}
            className="rounded-lg border-l-4 border-pending bg-pending-tint px-3 py-2.5 font-semibold text-pending"
          >
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Dialog.Close asChild>
          <Button variant="secondary" aria-disabled={guardando}>
            Cancelar
          </Button>
        </Dialog.Close>
        <Button type="submit" aria-disabled={guardando} aria-describedby={error ? errorId : undefined}>
          {guardando ? (
            <>
              <LoaderCircle aria-hidden="true" size={18} className="motion-safe:animate-spin" />
              Guardando…
            </>
          ) : (
            "Guardar"
          )}
        </Button>
      </div>
    </form>
  );
}
