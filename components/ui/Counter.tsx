"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface CounterProps {
  value: number;
  onChange: (value: number) => void;
  /** Texto visible del contador (también nombre accesible). */
  label: string;
  min?: number;
  max?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Convierte el texto del input en un entero dentro de [min, max]; lo inválido vale `min`. */
export function clampCount(raw: string | number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof raw === "number" ? Math.trunc(raw) : parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) return min;
  return Math.min(n, max);
}

/**
 * Contador con botones −/+ y campo numérico (≥ 0).
 * El número no se anima; solo responden los botones.
 */
export function Counter({
  value,
  onChange,
  label,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  id,
  disabled = false,
  className,
}: CounterProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const set = (n: number) => onChange(clampCount(n, min, max));

  return (
    <div className={cn("flex min-h-12 items-center justify-between gap-3", className)}>
      <label htmlFor={inputId} className="text-base text-ink">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Restar uno: ${label}`}
          disabled={disabled || value <= min}
          onClick={() => set(value - 1)}
        >
          <Minus aria-hidden="true" className="size-5" />
        </Button>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={min}
          max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(clampCount(e.target.value, min, max))}
          onFocus={(e) => e.target.select()}
          className="h-11 w-14 rounded-lg border border-line bg-white text-center text-lg font-semibold tabular-nums text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Sumar uno: ${label}`}
          disabled={disabled || value >= max}
          onClick={() => set(value + 1)}
        >
          <Plus aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </div>
  );
}
