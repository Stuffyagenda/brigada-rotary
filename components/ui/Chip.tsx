"use client";

import { Check } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/**
 * Chip de selección (toggle con `aria-pressed`). Solo anima `background-color`
 * y bordes (120 ms). Marcado: fondo gold y ✓, para no depender solo del color.
 */
export function Chip({
  pressed,
  onPressedChange,
  onClick,
  className,
  children,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onPressedChange(!pressed);
      }}
      className={cn(
        "inline-flex min-h-11 select-none items-center gap-1.5 rounded-full border px-4 text-base",
        "transition-[background-color,border-color] duration-120 ease-[ease]",
        pressed
          ? "border-gold bg-gold font-semibold text-ink"
          : "border-ink-soft bg-white text-ink hover:border-ink",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {pressed && <Check aria-hidden="true" className="-ml-1 size-4" strokeWidth={3} />}
      {children}
    </button>
  );
}
