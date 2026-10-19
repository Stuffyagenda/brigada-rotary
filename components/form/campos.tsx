"use client";

/**
 * Piezas de presentación del formulario: secciones, mensajes de error, control
 * segmentado (radios nativos), grupo de chips, fila Sí/No y casilla.
 */
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { Chip } from "@/components/ui/Chip";
import { YesNo } from "@/components/ui/YesNo";
import { cn } from "@/lib/cn";

/** Clases comunes de los campos de texto y del select. */
export const inputClass =
  "block min-h-12 w-full rounded-lg border border-line bg-white px-3 text-base text-ink " +
  "placeholder:text-ink-soft aria-invalid:border-pending aria-invalid:bg-pending-tint/40";

/**
 * Campo `type="date"`: mismas medidas que el resto; en iOS el valor se alinea a
 * la izquierda (Safari lo centra) y el control no se encoge a su contenido.
 */
export const inputFechaClass =
  inputClass + " appearance-none text-left tabular-nums [&::-webkit-date-and-time-value]:text-left";

/** Sección del formulario: `fieldset` con `legend` visible. */
export function Seccion({
  titulo,
  extra,
  descripcion,
  children,
  className,
  ...props
}: Omit<ComponentProps<"fieldset">, "title"> & {
  titulo: string;
  /** Contenido alineado a la derecha del título (p. ej. el total de personas). */
  extra?: ReactNode;
  descripcion?: string;
}) {
  return (
    <fieldset className={cn("min-w-0 border-b border-line px-4 pt-5 pb-6", className)} {...props}>
      <legend className="float-left mb-3 flex w-full items-baseline justify-between gap-3">
        <span className="text-lg font-bold text-ink">{titulo}</span>
        {extra}
      </legend>
      <div className="clear-both flex flex-col gap-4">
        {descripcion && <p className="-mt-2 text-sm text-ink-soft">{descripcion}</p>}
        {children}
      </div>
    </fieldset>
  );
}

/** Mensaje de error de un campo (se enlaza con `aria-describedby`). */
export function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-semibold text-pending">
      {mensaje}
    </p>
  );
}

/** Etiqueta de campo de texto. */
export function Etiqueta({ htmlFor, children, opcional }: { htmlFor: string; children: ReactNode; opcional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-base font-semibold text-ink">
      {children}
      {opcional && <span className="font-normal text-ink-soft"> (opcional)</span>}
    </label>
  );
}

export interface OpcionSegmento<T extends string> {
  value: T;
  label: string;
  /** Clases del segmento cuando está marcado (por defecto, gold). */
  marcado?: string;
}

/**
 * Control segmentado con radios nativos: flechas del teclado, foco y lector de
 * pantalla funcionan sin JS extra. Solo cambia el color del segmento marcado.
 */
export function Segmentado<T extends string>({
  legend,
  name,
  opciones,
  value,
  onChange,
  className,
}: {
  legend: string;
  name: string;
  opciones: readonly OpcionSegmento<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-base font-semibold text-ink">{legend}</legend>
      <div
        className="grid gap-1 rounded-lg border border-line bg-white p-1"
        style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
      >
        {opciones.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex min-h-11 cursor-pointer select-none items-center justify-center rounded-md px-2 py-1",
                "text-center text-base leading-tight",
                "transition-[background-color,color] duration-140 ease-out",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold",
                checked ? (o.marcado ?? "bg-gold font-semibold text-ink") : "text-ink-soft hover:bg-ink/5",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Grupo de chips de selección múltiple. Conserva el orden de `opciones`. */
export function GrupoChips({
  legend,
  opciones,
  value,
  onChange,
}: {
  legend: string;
  opciones: readonly string[];
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (op: string, pressed: boolean) => {
    const set = new Set(value);
    if (pressed) set.add(op);
    else set.delete(op);
    // Orden canónico; se conservan valores antiguos que no están en la lista.
    const extras = value.filter((v) => !opciones.includes(v) && set.has(v));
    onChange([...opciones.filter((o) => set.has(o)), ...extras]);
  };
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-base font-semibold text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {opciones.map((op) => (
          <Chip key={op} pressed={value.includes(op)} onPressedChange={(p) => toggle(op, p)}>
            {op}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/** Fila con etiqueta y control Sí/No. */
export function FilaSiNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span id={id} className="text-base text-ink">
        {label}
      </span>
      <YesNo value={value} onChange={onChange} aria-labelledby={id} className="shrink-0" />
    </div>
  );
}

/** Casilla de verificación de fila completa (objetivo táctil ≥ 48 px). */
export function Casilla({
  label,
  checked,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-14 cursor-pointer select-none items-center gap-3 rounded-lg border bg-white px-3 py-2",
        "transition-[background-color,border-color] duration-120 ease-[ease]",
        "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold",
        checked ? "border-rotary bg-rotary/5" : "border-line",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 cursor-pointer accent-rotary"
      />
      <span className="text-base font-semibold text-ink">{label}</span>
    </label>
  );
}
