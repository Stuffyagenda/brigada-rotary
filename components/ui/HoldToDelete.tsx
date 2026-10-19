"use client";

export interface HoldToDeleteProps {
  /** Se ejecuta tras mantener pulsado 2 s. Debe lanzar Error con un mensaje para el usuario si falla. */
  onConfirm: () => Promise<void>;
  /** Texto del botón, p. ej. "Mantén pulsado para borrar". */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Contrato fijo. Implementación: agente `formulario`. Solo se muestra a admins. */
export function HoldToDelete({ label = "Mantén pulsado para borrar", disabled, className }: HoldToDeleteProps) {
  return (
    <button type="button" disabled={disabled} className={className}>
      {label}
    </button>
  );
}
