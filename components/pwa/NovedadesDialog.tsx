"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Sparkles } from "lucide-react";
import { DIALOG_KEYFRAMES, DIALOG_STYLE_HREF } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { formatearFechaLarga } from "@/lib/vigencia";
import { versionCorta, type Novedades } from "@/lib/novedades";

export interface NovedadesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novedades: Novedades;
  /** Dónde vuelve el foco al cerrar (por defecto, el elemento que lo abrió). */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Novedades de una versión (Radix Dialog). Se cierra con "Entendido", Esc o
 * clic fuera; el foco inicial va al botón.
 */
export function NovedadesDialog({ open, onOpenChange, novedades, onCloseAutoFocus }: NovedadesDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <style href={DIALOG_STYLE_HREF} precedence="default">
          {DIALOG_KEYFRAMES}
        </style>
        <Dialog.Overlay className="br-overlay fixed inset-0 z-[60] bg-ink/40" />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector<HTMLElement>("[data-entendido]")?.focus();
          }}
          className="br-dialog fixed top-1/2 left-1/2 z-[60] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-white p-6 shadow-[0_16px_48px_-12px_rgb(28_39_51/0.35)]"
        >
          <Dialog.Title className="flex items-center gap-2 text-lg font-bold">
            <Sparkles aria-hidden="true" size={20} className="shrink-0 text-rotary" />
            Novedades de la versión {versionCorta(novedades.version)}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-soft">
            Publicada el {formatearFechaLarga(novedades.fecha)}
          </Dialog.Description>
          <ul className="mt-4 flex min-h-0 list-disc flex-col gap-2.5 overflow-y-auto pl-5 marker:text-ink-soft">
            {novedades.cambios.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <Button data-entendido>Entendido</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
