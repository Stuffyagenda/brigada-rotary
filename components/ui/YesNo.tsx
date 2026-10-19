"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/** El grupo necesita nombre accesible: `label` o `aria-labelledby`. */
type YesNoName = { label: string; "aria-labelledby"?: string } | { label?: string; "aria-labelledby": string };

export type YesNoProps = YesNoName & {
  value: boolean;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Interruptor Sí/No como control segmentado (`role="radiogroup"`).
 * El marcador se desplaza con `translateX` (150 ms, interrumpible).
 * Teclado: las flechas alternan; Tab entra en la opción marcada.
 */
export function YesNo({
  value,
  onChange,
  label,
  "aria-labelledby": labelledBy,
  yesLabel = "Sí",
  noLabel = "No",
  disabled = false,
  className,
}: YesNoProps) {
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  const select = (next: boolean) => {
    if (disabled) return;
    if (next !== value) onChange(next);
    (next ? yesRef : noRef).current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Patrón WAI-ARIA de radio: con dos opciones, cualquier flecha alterna.
    if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      select(!value);
    }
  };

  const option = (selected: boolean) =>
    cn(
      "relative z-10 flex min-h-11 flex-1 items-center justify-center rounded-md px-4 text-base",
      "transition-colors duration-140 ease-out",
      selected ? "font-semibold text-ink" : "text-ink-soft",
    );

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "relative inline-flex w-36 rounded-lg border border-line bg-white p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-testid="yesno-marker"
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-gold",
          "transition-[translate] duration-150 ease-out",
          value ? "translate-x-0" : "translate-x-full",
        )}
      />
      <button
        ref={yesRef}
        type="button"
        role="radio"
        aria-checked={value}
        tabIndex={value ? 0 : -1}
        disabled={disabled}
        onClick={() => select(true)}
        className={option(value)}
      >
        {yesLabel}
      </button>
      <button
        ref={noRef}
        type="button"
        role="radio"
        aria-checked={!value}
        tabIndex={value ? -1 : 0}
        disabled={disabled}
        onClick={() => select(false)}
        className={option(!value)}
      >
        {noLabel}
      </button>
    </div>
  );
}
