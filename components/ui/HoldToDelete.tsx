"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

export interface HoldToDeleteProps {
  /** Se ejecuta tras mantener pulsado 2 s. Debe lanzar Error con un mensaje para el usuario si falla. */
  onConfirm: () => Promise<void>;
  /** Texto del botón, p. ej. "Mantén pulsado para borrar". */
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Nombre accesible. Por defecto explica que hay que mantener pulsado 2 segundos. */
  ariaLabel?: string;
}

/** Tiempo que hay que mantener pulsado. */
export const HOLD_MS = 2000;
/** Vuelta del relleno al soltar antes de tiempo. */
const RETURN_MS = 200;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const VACIO = "inset(0 100% 0 0)";
const LLENO = "inset(0 0 0 0)";
const LABEL_POR_DEFECTO = "Mantén pulsado para borrar";

type Fase = "reposo" | "pulsado" | "borrando";

/** Progreso (0..1) que muestra ahora el relleno, leyendo el clip-path calculado (incluye animaciones). */
function progresoActual(el: HTMLElement | null): number {
  if (!el) return 0;
  const clip = getComputedStyle(el).clipPath || el.style.clipPath;
  const m = /inset\(\s*[\d.]+\w*\s+([\d.]+)%/.exec(clip ?? "");
  if (!m) return clip?.startsWith("inset(0") && !clip.includes("%") ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - Number(m[1]) / 100));
}

function clipDe(progreso: number): string {
  return `inset(0 ${(1 - progreso) * 100}% 0 0)`;
}

/**
 * Botón de borrado con "mantener pulsado" (sustituye al PIN). Solo para admins.
 *
 * - Puntero o teclado (Enter/Espacio sostenido): un relleno rojo oscuro avanza
 *   con `clip-path` de izquierda a derecha en 2 s lineales.
 * - Al soltar antes, vuelve en 200 ms --ease-out; al completar, llama a `onConfirm`.
 * - El relleno se anima con la Web Animations API, así sigue visible con
 *   movimiento reducido (es información); solo se quita el `scale(0.97)`.
 * - Ignora el multitáctil (un segundo dedo cancela) y cancela si el dedo sale del botón.
 */
export function HoldToDelete({
  onConfirm,
  label = LABEL_POR_DEFECTO,
  disabled,
  className,
  ariaLabel,
}: HoldToDeleteProps) {
  const rellenoRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const punteroRef = useRef<number | null>(null);
  const faseRef = useRef<Fase>("reposo");
  const montadoRef = useRef(true);
  const [fase, setFaseState] = useState<Fase>("reposo");

  const setFase = (f: Fase) => {
    faseRef.current = f;
    if (montadoRef.current) setFaseState(f);
  };

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      animRef.current?.cancel();
    };
  }, []);

  const animar = (hasta: string, duracion: number, easing: string) => {
    const el = rellenoRef.current;
    if (!el) return;
    const desde = clipDe(progresoActual(el));
    animRef.current?.cancel();
    animRef.current = null;
    el.style.clipPath = hasta;
    if (typeof el.animate === "function" && duracion > 0) {
      animRef.current = el.animate([{ clipPath: desde }, { clipPath: hasta }], { duration: duracion, easing });
    }
  };

  const completar = async () => {
    timerRef.current = null;
    punteroRef.current = null;
    setFase("borrando");
    try {
      await onConfirm();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo borrar. Inténtalo de nuevo.");
    } finally {
      if (montadoRef.current) {
        setFase("reposo");
        animar(VACIO, RETURN_MS, EASE_OUT);
      }
    }
  };

  const empezar = () => {
    if (disabled || faseRef.current !== "reposo") return;
    const restante = (1 - progresoActual(rellenoRef.current)) * HOLD_MS;
    setFase("pulsado");
    animar(LLENO, restante, "linear");
    timerRef.current = setTimeout(completar, restante);
  };

  const cancelar = () => {
    punteroRef.current = null;
    if (faseRef.current !== "pulsado") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setFase("reposo");
    animar(VACIO, RETURN_MS, EASE_OUT);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Un segundo dedo cancela: el gesto debe ser deliberado y de un solo dedo.
    if (punteroRef.current !== null || e.isPrimary === false) {
      cancelar();
      return;
    }
    punteroRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    empezar();
  };

  const onPointerEnd = (e: PointerEvent<HTMLButtonElement>) => {
    if (punteroRef.current === null || e.pointerId !== punteroRef.current) return;
    cancelar();
  };

  // Con pointer capture no llega pointerleave mientras se mantiene: se comprueba la posición.
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== punteroRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const fuera = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (fuera) cancelar();
  };

  const esTecla = (e: KeyboardEvent) => e.key === "Enter" || e.key === " " || e.key === "Spacebar";

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!esTecla(e)) return;
    e.preventDefault();
    if (e.repeat) return;
    empezar();
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!esTecla(e)) return;
    e.preventDefault();
    cancelar();
  };

  const borrando = fase === "borrando";
  const nombre =
    ariaLabel ??
    (label === LABEL_POR_DEFECTO
      ? "Mantén pulsado 2 segundos para borrar"
      : `${label}. Mantén pulsado 2 segundos para borrar`);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={borrando || undefined}
      aria-label={borrando ? "Borrando…" : nombre}
      data-fase={fase}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={cancelar}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "relative inline-flex min-h-12 touch-none select-none items-center justify-center gap-2 overflow-hidden",
        "rounded-lg bg-pending px-5 text-base font-semibold text-white [-webkit-touch-callout:none]",
        "transition-[scale] duration-140 ease-out",
        "data-[fase=pulsado]:motion-safe:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-50",
        borrando && "cursor-progress",
        className,
      )}
    >
      <span
        ref={rellenoRef}
        aria-hidden="true"
        data-testid="hold-relleno"
        className="pointer-events-none absolute inset-0 bg-pending-strong"
        style={{ clipPath: VACIO }}
      />
      <Trash2 aria-hidden="true" className="relative size-5" />
      <span className="relative">{borrando ? "Borrando…" : label}</span>
      <span className="sr-only" role="status">
        {borrando ? "Borrando…" : ""}
      </span>
    </button>
  );
}
