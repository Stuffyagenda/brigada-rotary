"use client";

import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Nombre accesible del interruptor. */
  label: string;
  /** Texto visible junto al interruptor para cada estado (el color nunca va solo). */
  onText?: string;
  offText?: string;
  disabled?: boolean;
  className?: string;
}

/** Interruptor (`role="switch"`). El círculo se desplaza con `translate`, 150 ms. */
export function Switch({
  checked,
  onChange,
  label,
  onText = "Activo",
  offText = "Inactivo",
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-lg pr-1 text-base",
        disabled && "opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color] duration-150 ease-out",
          checked ? "border-rotary bg-rotary" : "border-ink-soft bg-paper",
        )}
      >
        <span
          data-testid="switch-thumb"
          className={cn(
            "absolute top-0.5 left-0.5 size-5.5 rounded-full shadow-[0_1px_2px_rgb(28_39_51/0.3)] transition-[translate,background-color] duration-150 ease-out",
            checked ? "translate-x-5 bg-white" : "translate-x-0 bg-ink-soft",
          )}
        />
      </span>
      <span aria-hidden="true" className={checked ? "font-semibold text-ink" : "text-ink-soft"}>
        {checked ? onText : offText}
      </span>
    </button>
  );
}
