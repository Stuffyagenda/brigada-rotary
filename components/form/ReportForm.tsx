"use client";

import type { LatLng } from "@/lib/pluscode";

export interface ReportFormProps {
  /** Id del reporte a editar, o "nuevo" para crear uno. */
  reporteId: string | "nuevo";
  /**
   * Ubicación elegida en el mapa (GPS, toque en el mapa o búsqueda).
   * La controla la pantalla del mapa; el formulario la muestra (con su Plus Code)
   * y la guarda. Si cambia mientras el formulario está abierto, se usa la nueva.
   */
  ubicacion: LatLng | null;
  /** El usuario pide cambiar la ubicación: el mapa activa el modo "elegir en mapa". */
  onRequestPickLocation: () => void;
  /** Cierra el formulario sin guardar. */
  onClose: () => void;
  /** Se llamó a saveReport con éxito. */
  onSaved: (id: string, estado: "PENDIENTE" | "ATENDIDO") => void;
}

/** Contrato fijo. Implementación: agente `formulario`. */
export function ReportForm({ onClose }: ReportFormProps) {
  return (
    <div className="p-4">
      <p>Formulario en construcción.</p>
      <button type="button" onClick={onClose}>
        Cerrar
      </button>
    </div>
  );
}
