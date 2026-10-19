"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { syncNow, useSyncState } from "@/lib/sync";

export interface SyncIndicatorProps {
  className?: string;
}

function textoPendientes(n: number): string {
  return n === 1 ? "1 pendiente" : `${n} pendientes`;
}

/**
 * Indicador compacto del estado de sincronización, para la barra superior:
 * En línea / Sin conexión, reportes pendientes de enviar y botón "Sincronizar ahora"
 * (el icono gira mientras sincroniza). Sin props obligatorias.
 */
export function SyncIndicator({ className }: SyncIndicatorProps) {
  const { online, syncing, pendientes, lastError } = useSyncState();

  const sincronizar = async () => {
    if (!online) {
      toast("Sin señal. Los reportes quedan en este celular y se enviarán solos cuando vuelva la conexión.");
      return;
    }
    const r = await syncNow();
    if (r.error) toast.error(r.error);
    else if (r.pendientes > 0) toast(`Quedan ${textoPendientes(r.pendientes)} por enviar.`);
    else toast.success(r.subidos > 0 ? "Reportes enviados" : "Todo está al día");
  };

  const estado = online ? "En línea" : "Sin conexión";
  const descripcion = [estado, pendientes > 0 ? textoPendientes(pendientes) : null, syncing ? "sincronizando" : null]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={cn("inline-flex items-center gap-1 text-sm text-ink", className)}
      data-online={online}
      data-syncing={syncing}
    >
      <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 pl-1" title={lastError}>
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            // Forma además de color: lleno en línea, anillo sin conexión.
            online ? "bg-done" : "border-2 border-pending bg-transparent",
          )}
        />
        {/* En móvil, con señal, basta el punto lleno (el texto queda para lectores de
            pantalla) y el buscador del mapa gana espacio. "Sin conexión" siempre se ve. */}
        <span className={cn("whitespace-nowrap", online && "max-sm:sr-only")}>{estado}</span>
        {pendientes > 0 && (
          <span className="whitespace-nowrap font-semibold tabular-nums text-pending">
            {textoPendientes(pendientes)}
          </span>
        )}
        <span className="sr-only">{syncing ? ", sincronizando" : ""}</span>
        {lastError && <span className="sr-only">. {lastError}</span>}
      </span>
      <button
        type="button"
        onClick={() => void sincronizar()}
        disabled={syncing}
        aria-label={`Sincronizar ahora (${descripcion})`}
        title="Sincronizar ahora"
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink",
          "transition-[scale,background-color] duration-140 ease-out hover:bg-ink/5 active:bg-ink/10",
          "motion-safe:active:scale-[0.97] disabled:cursor-progress",
        )}
      >
        {/* Giro lineal de 700 ms (la duración en línea sustituye el 1 s de `animate-spin`). */}
        <RefreshCw
          aria-hidden
          className={cn("size-5", syncing && "motion-safe:animate-spin")}
          style={syncing ? { animationDuration: "700ms" } : undefined}
        />
      </button>
    </div>
  );
}
