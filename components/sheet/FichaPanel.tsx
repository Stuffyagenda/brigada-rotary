"use client";

/** Ficha de un reporte dentro del panel: carga el reporte local y monta TriageTag. */
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useReporte } from "@/hooks/useReportes";
import { deleteReport } from "@/lib/sync";
import { TriageTag } from "./TriageTag";

export interface FichaPanelProps {
  id: string;
  nombresClub: Map<string, string>;
  isAdmin: boolean;
  animarAtendido: boolean;
  onCerrar: () => void;
  onEditar: () => void;
  /** Tras borrar: cerrar la ficha. */
  onBorrado: () => void;
  /** Acciones dentro de la ficha (escritorio); en el móvil van en el pie del panel. */
  conAcciones?: boolean;
}

export function FichaPanel({
  id,
  nombresClub,
  isAdmin,
  animarAtendido,
  onCerrar,
  onEditar,
  onBorrado,
  conAcciones = true,
}: FichaPanelProps) {
  const { reporte, loading } = useReporte(id);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const existe = Boolean(reporte);

  // Al abrir una ficha, el foco pasa a su título (lectores de pantalla y teclado).
  useEffect(() => {
    if (existe) tituloRef.current?.focus({ preventScroll: true });
  }, [id, existe]);

  const cerrar = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onCerrar}
      aria-label="Cerrar ficha"
      title="Cerrar ficha"
      className="-mt-1 -mr-2"
    >
      <X aria-hidden="true" className="size-5" />
    </Button>
  );

  if (loading) return null;

  if (!reporte) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">No encontramos este reporte en este celular</h2>
          {cerrar}
        </div>
        <p className="text-ink-soft">
          Puede que lo hayan borrado o que aún no se haya descargado. Con conexión, los reportes se descargan solos.
        </p>
        <Button variant="secondary" onClick={onCerrar}>
          Volver al mapa
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="-mb-1 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-soft">Ficha de la familia</p>
        {cerrar}
      </div>
      <TriageTag
        reporte={reporte}
        clubNombre={reporte.club_id ? nombresClub.get(reporte.club_id) : null}
        onEditar={onEditar}
        onRegistrarEntrega={onEditar}
        animarAtendido={animarAtendido}
        tituloRef={tituloRef}
        conAcciones={conAcciones}
        puedeBorrar={isAdmin}
        onBorrar={async () => {
          await deleteReport(reporte.id);
          onBorrado();
          toast("Reporte borrado");
        }}
      />
    </div>
  );
}
