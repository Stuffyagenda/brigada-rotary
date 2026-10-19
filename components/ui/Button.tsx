import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "lg" | "icon";

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa todo el ancho disponible. */
  block?: boolean;
}

// Tailwind v4 usa las propiedades CSS `scale`/`translate`: se transicionan por nombre.
const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold " +
  "transition-[scale,background-color,border-color,color] duration-140 ease-out " +
  "motion-safe:active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-rotary text-white hover:bg-rotary-strong active:bg-rotary-strong",
  secondary: "border border-line bg-white text-ink hover:border-ink-soft",
  danger: "bg-pending text-white hover:bg-pending/90",
  ghost: "bg-transparent text-ink hover:bg-ink/5 active:bg-ink/10",
};

// Todas las medidas táctiles son ≥ 44 px.
const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-base",
  lg: "min-h-14 px-6 text-lg",
  icon: "size-11 shrink-0 p-0",
};

/** Botón base. `type="button"` por defecto (no envía formularios sin querer). */
export function Button({
  variant = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={cn(base, variants[variant], sizes[size], block && "w-full", className)}
      {...props}
    />
  );
}
