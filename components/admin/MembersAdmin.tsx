"use client";

import { ArrowLeft, Info, RotateCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  actualizarMiembro,
  adminErrorMessage,
  avisoGuardado,
  bloqueoPropio,
  cargarMiembros,
  confirmacionNecesaria,
  nombreVisible,
  type ClubOpcion,
  type Miembro,
  type MiembroCambio,
} from "@/components/admin/members-data";
import { Switch } from "@/components/admin/Switch";
import { Button } from "@/components/ui/Button";
import { useProfile } from "@/lib/auth/profile";
import { cn } from "@/lib/cn";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ROL_LABEL, ROLES, TIPO_CLUB_LABEL, type Rol } from "@/lib/types";

type Carga =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "listo"; miembros: Miembro[]; clubs: ClubOpcion[] };

interface Dialogo {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

const selectClass =
  "min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink " +
  "transition-[border-color] duration-140 ease-out hover:border-ink-soft disabled:opacity-50";

function Volver() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-rotary hover:underline"
    >
      <ArrowLeft aria-hidden="true" size={20} />
      Volver al mapa
    </Link>
  );
}

interface FilaProps {
  miembro: Miembro;
  clubs: readonly ClubOpcion[];
  esYo: boolean;
  guardando: boolean;
  onCambio: (miembro: Miembro, cambio: MiembroCambio) => void;
}

function FilaMiembro({ miembro, clubs, esYo, guardando, onCambio }: FilaProps) {
  const id = useId();
  const nombre = nombreVisible(miembro);
  const clubActual = clubs.find((c) => c.id === miembro.club_id);

  return (
    <li aria-busy={guardando || undefined} className="py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <p className={cn("font-semibold", !miembro.nombre_completo?.trim() && "text-ink-soft")}>{nombre}</p>
        {esYo && <span className="text-sm text-ink-soft">(tú)</span>}
        {!miembro.activo && <span className="text-sm font-semibold text-pending">Sin acceso</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-club`} className="text-sm text-ink-soft">
            Club
          </label>
          <select
            id={`${id}-club`}
            value={miembro.club_id ?? ""}
            disabled={guardando}
            onChange={(e) => onCambio(miembro, { club_id: e.target.value || null })}
            className={selectClass}
          >
            <option value="">Sin club</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({TIPO_CLUB_LABEL[c.tipo] ?? c.tipo})
              </option>
            ))}
            {/* Club no visible en la lista (no debería pasar): se conserva el valor. */}
            {miembro.club_id && !clubActual && <option value={miembro.club_id}>Club desconocido</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-rol`} className="text-sm text-ink-soft">
            Rol
          </label>
          <select
            id={`${id}-rol`}
            value={miembro.rol}
            disabled={guardando}
            onChange={(e) => onCambio(miembro, { rol: e.target.value as Rol })}
            className={selectClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <Switch
          checked={miembro.activo}
          disabled={guardando}
          label={`Acceso de ${nombre}`}
          onChange={(activo) => onCambio(miembro, { activo })}
        />
      </div>
    </li>
  );
}

/** Página de administración de miembros (solo admin). Necesita conexión. */
export function MembersAdmin() {
  const { profile, isAdmin, loading, refresh: refreshProfile } = useProfile();
  const selfId = profile?.id ?? null;
  const [carga, setCarga] = useState<Carga>({ estado: "cargando" });
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());
  // El contenido se conserva al cerrar para que no se vacíe durante la animación de salida.
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCarga({ estado: "cargando" });
    try {
      const datos = await cargarMiembros(getSupabaseBrowserClient());
      setCarga({ estado: "listo", ...datos });
    } catch (error) {
      setCarga({ estado: "error", mensaje: adminErrorMessage(error, "cargar los miembros") });
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    cargarMiembros(getSupabaseBrowserClient())
      .then((datos) => {
        if (active) setCarga({ estado: "listo", ...datos });
      })
      .catch((error: unknown) => {
        if (active) setCarga({ estado: "error", mensaje: adminErrorMessage(error, "cargar los miembros") });
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const reemplazar = useCallback((fila: Miembro) => {
    setCarga((c) =>
      c.estado === "listo" ? { ...c, miembros: c.miembros.map((m) => (m.id === fila.id ? fila : m)) } : c,
    );
  }, []);

  const guardar = useCallback(
    async (miembro: Miembro, cambio: MiembroCambio, clubs: readonly ClubOpcion[]) => {
      setGuardando((s) => new Set(s).add(miembro.id));
      // Optimista: se muestra el cambio y se revierte si falla.
      reemplazar({ ...miembro, ...cambio });
      try {
        const fila = await actualizarMiembro(getSupabaseBrowserClient(), miembro.id, cambio);
        reemplazar(fila);
        toast.success(avisoGuardado(fila, cambio, clubs));
        if (fila.id === selfId) void refreshProfile();
      } catch (error) {
        reemplazar(miembro);
        toast.error(adminErrorMessage(error));
      } finally {
        setGuardando((s) => {
          const n = new Set(s);
          n.delete(miembro.id);
          return n;
        });
      }
    },
    [reemplazar, refreshProfile, selfId],
  );

  const onCambio = useCallback(
    (miembro: Miembro, cambio: MiembroCambio, clubs: readonly ClubOpcion[]) => {
      const bloqueo = bloqueoPropio(selfId, miembro, cambio);
      if (bloqueo) {
        setDialogo(bloqueo);
        setDialogoAbierto(true);
        return;
      }
      const confirmar = confirmacionNecesaria(miembro, cambio);
      if (confirmar) {
        setDialogo({ ...confirmar, onConfirm: () => void guardar(miembro, cambio, clubs) });
        setDialogoAbierto(true);
        return;
      }
      void guardar(miembro, cambio, clubs);
    },
    [guardar, selfId],
  );

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <p role="status" className="text-ink-soft">
          Comprobando tus permisos…
        </p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-8">
        <h1 className="text-xl font-bold">Miembros</h1>
        <p className="text-ink-soft">Esta página es solo para administradores.</p>
        <div>
          <Volver />
        </div>
      </main>
    );
  }

  const total = carga.estado === "listo" ? carga.miembros.length : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-4 pb-12">
      <div className="-ml-1">
        <Volver />
      </div>
      <header className="mt-2 mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Miembros</h1>
        {total !== null && (
          <p className="text-ink-soft">
            {total === 1 ? "1 miembro" : `${total} miembros`}
          </p>
        )}
      </header>

      <p className="mb-2 flex gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-ink-soft ring-1 ring-line">
        <Info aria-hidden="true" size={18} className="mt-px shrink-0" />
        <span>Para crear usuarios, usa Authentication → Users en el panel de Supabase.</span>
      </p>

      {carga.estado === "cargando" && (
        <p role="status" className="py-8 text-ink-soft">
          Cargando miembros…
        </p>
      )}

      {carga.estado === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 py-8">
          <p className="font-semibold">{carga.mensaje}</p>
          <Button variant="secondary" onClick={() => void cargar()}>
            <RotateCw aria-hidden="true" size={18} />
            Reintentar
          </Button>
        </div>
      )}

      {carga.estado === "listo" &&
        (carga.miembros.length === 0 ? (
          <p className="py-8 text-ink-soft">Todavía no hay miembros.</p>
        ) : (
          <ul aria-label="Lista de miembros" className="divide-y divide-line border-t border-line">
            {carga.miembros.map((m) => (
              <FilaMiembro
                key={m.id}
                miembro={m}
                clubs={carga.clubs}
                esYo={m.id === selfId}
                guardando={guardando.has(m.id)}
                onCambio={(miembro, cambio) => onCambio(miembro, cambio, carga.clubs)}
              />
            ))}
          </ul>
        ))}

      <ConfirmDialog
        open={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        title={dialogo?.title ?? ""}
        description={dialogo?.description ?? ""}
        confirmLabel={dialogo?.confirmLabel}
        onConfirm={dialogo?.onConfirm}
      />
    </main>
  );
}
