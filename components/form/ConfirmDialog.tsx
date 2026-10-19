"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import "./confirm-dialog.css";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pregunta principal (título accesible del diálogo). */
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` para acciones que descartan datos. */
  tone?: "primary" | "danger";
  onConfirm: () => void;
}

const boton =
  "inline-flex min-h-12 select-none items-center justify-center rounded-lg px-5 text-base font-semibold " +
  "transition-[scale,background-color,border-color] duration-140 ease-out motion-safe:active:scale-[0.97]";

/**
 * Confirmación modal (Radix AlertDialog): el foco queda atrapado y vuelve al
 * botón que la abrió. El foco inicial va a la opción segura ("Seguir editando").
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={cn("rf-dialog-overlay", "fixed inset-0 z-[70] bg-ink/45")} />
        <AlertDialog.Content
          className={cn(
            "rf-dialog-content",
            "z-[71] w-[calc(100vw-2rem)] max-w-sm rounded-xl bg-white p-5 text-ink shadow-[0_12px_40px_rgb(28_39_51/0.28)]",
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <AlertDialog.Title className="text-lg font-bold leading-snug">{title}</AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="mt-2 text-base text-ink-soft">{description}</AlertDialog.Description>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className={cn(boton, "border border-line bg-white text-ink hover:border-ink-soft")}>
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={cn(
                boton,
                tone === "danger"
                  ? "bg-pending text-white hover:bg-pending/90"
                  : "bg-rotary text-white hover:bg-rotary-strong",
              )}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
