"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** Aviso a pantalla completa del formulario (cargando, registro inexistente) con botón "Volver". */
export function Aviso({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {children}
      <Button variant="secondary" onClick={onClose} className="self-start">
        Volver
      </Button>
    </div>
  );
}
