"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/Button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Si falta, el diálogo solo informa (un único botón "Entendido"). */
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
}

// Entrada scale(0.96) + opacidad, 200 ms; salida 150 ms. Con movimiento
// reducido, solo opacidad. React 19 sube y deduplica este <style> en <head>.
const KEYFRAMES = `
@keyframes br-dialog-in { from { opacity: 0; scale: 0.96; } }
@keyframes br-dialog-out { to { opacity: 0; scale: 0.96; } }
@keyframes br-fade-in { from { opacity: 0; } }
@keyframes br-fade-out { to { opacity: 0; } }
.br-dialog[data-state="open"] { animation: br-dialog-in 200ms var(--ease-out); }
.br-dialog[data-state="closed"] { animation: br-dialog-out 150ms var(--ease-out); }
.br-overlay[data-state="open"] { animation: br-fade-in 200ms var(--ease-out); }
.br-overlay[data-state="closed"] { animation: br-fade-out 150ms var(--ease-out); }
@media (prefers-reduced-motion: reduce) {
  .br-dialog[data-state="open"] { animation-name: br-fade-in; }
  .br-dialog[data-state="closed"] { animation-name: br-fade-out; }
}
`;

/** Diálogo de confirmación (Radix AlertDialog). Centrado; Esc o "Cancelar" lo cierran. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <style href="br-confirm-dialog" precedence="default">
          {KEYFRAMES}
        </style>
        <AlertDialog.Overlay className="br-overlay fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="br-dialog fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-white p-6 shadow-[0_16px_48px_-12px_rgb(28_39_51/0.35)]">
          <AlertDialog.Title className="text-lg font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-ink-soft">{description}</AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {confirmLabel ? (
              <>
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary">{cancelLabel}</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button variant="danger" onClick={onConfirm}>
                    {confirmLabel}
                  </Button>
                </AlertDialog.Action>
              </>
            ) : (
              <AlertDialog.Cancel asChild>
                <Button variant="primary">Entendido</Button>
              </AlertDialog.Cancel>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
