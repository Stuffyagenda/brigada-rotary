import type { ReactNode } from "react";

/** Estilo de los campos de texto de las pantallas de acceso y los diálogos de datos. */
export const inputClass =
  "block min-h-12 w-full rounded-lg border border-line bg-white px-3 text-base text-ink " +
  "transition-[border-color] duration-140 ease-out placeholder:text-ink-soft " +
  "hover:border-ink-soft focus-visible:border-rotary aria-invalid:border-pending " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** `aria-describedby` con los ids presentes (o `undefined` si no hay ninguno). */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const lista = ids.filter(Boolean);
  return lista.length ? lista.join(" ") : undefined;
}

export interface CampoProps {
  /** id del control; la ayuda y el error usan `${id}-hint` y `${id}-error`. */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** El control (input o select) con `id`, `aria-invalid` y `aria-describedby`. */
  children: ReactNode;
}

/** Etiqueta, control, ayuda y error junto al campo. */
export function Campo({ id, label, hint, error, children }: CampoProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children}
      {/* Con error, la ayuda se oculta: el error ya la repite con más detalle. */}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-pending">
          {error}
        </p>
      )}
    </div>
  );
}

/** `aria-describedby` estándar de un `Campo`. */
export function campoDescribedBy(id: string, { hint, error }: { hint?: string; error?: string }) {
  return describedBy(hint && !error && `${id}-hint`, error && `${id}-error`);
}
