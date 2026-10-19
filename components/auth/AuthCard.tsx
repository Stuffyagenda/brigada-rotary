import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface AuthCardProps {
  children: ReactNode;
  /** Color de la franja lateral: `rotary` (acceso) o `pending` (acceso bloqueado). */
  tone?: "rotary" | "pending";
  className?: string;
}

/**
 * Ficha de triaje para las pantallas de acceso: franja lateral de color separada
 * del cuerpo por un borde perforado (muescas con `radial-gradient`).
 */
export function AuthCard({ children, tone = "rotary", className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "flex w-full overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgb(28_39_51/0.06),0_8px_24px_-12px_rgb(28_39_51/0.18)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        data-testid="auth-card-stripe"
        className={cn("w-4 shrink-0", tone === "rotary" ? "bg-rotary" : "bg-pending")}
      />
      {/* Borde perforado: círculos del color del fondo sobre la unión. */}
      <div
        aria-hidden="true"
        className="-ml-1.5 w-3 shrink-0 bg-[radial-gradient(circle,var(--color-paper)_2.5px,transparent_3px)] bg-size-[12px_12px] bg-repeat-y"
      />
      <div className="min-w-0 flex-1 py-7 pr-6 pl-3 sm:py-8 sm:pr-8 sm:pl-4">{children}</div>
    </div>
  );
}
